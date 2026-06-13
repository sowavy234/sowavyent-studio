const PARAM_DEFAULTS = {
  enabled: 1,
  strength: 0.88,
  retuneSpeedMs: 42,
  humanize: 0.08,
}

const SCALE_MAX_NOTES = 64
const SCALE_VERSION_INDEX = 0
const SCALE_COUNT_INDEX = 1
const SCALE_NOTES_OFFSET = 2

class AutoTuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: PARAM_DEFAULTS.enabled, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'strength', defaultValue: PARAM_DEFAULTS.strength, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'retuneSpeedMs', defaultValue: PARAM_DEFAULTS.retuneSpeedMs, minValue: 5, maxValue: 140, automationRate: 'k-rate' },
      { name: 'humanize', defaultValue: PARAM_DEFAULTS.humanize, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()
    this.scaleNotes = [65, 67, 68, 70, 72, 73, 75, 77]
    this.scaleView = null
    this.scaleVersion = -1

    this.pitchRatio = 1
    this.targetRatio = 1
    this.delay = new Float32Array(32768)
    this.writePos = 0
    this.readPos = -768

    this.analysisSize = 1024
    this.analysisMask = this.analysisSize - 1
    this.analysisRing = new Float32Array(this.analysisSize)
    this.analysisWrite = 0
    this.analysisSamples = 0
    this.analysisHop = 0
    this.minLag = Math.max(18, Math.floor(sampleRate / 950))
    this.maxLag = Math.min(this.analysisSize - 16, Math.floor(sampleRate / 65))

    this.telemetryFrame = 0
    this.frame = 0
    this.lastDetectedHz = 0
    this.lastSnappedMidi = 0
    this.correctionCents = 0
    this.lastRms = 0
    this.lastPitchScore = 0
    this.lastAnalysisMs = 0
    this.voiceActive = false

    this.port.onmessage = (event) => {
      const data = event.data
      if (data?.type === 'scale' && Array.isArray(data.scaleNotes)) {
        this.scaleNotes = data.scaleNotes.slice(0, SCALE_MAX_NOTES)
        return
      }

      if (data?.type === 'scaleBuffer' && data.scaleBuffer instanceof SharedArrayBuffer) {
        this.scaleView = new Int32Array(data.scaleBuffer)
        this.refreshScaleFromShared()
      }
    }
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  readParam(parameters, name, index) {
    const values = parameters[name]
    if (!values || values.length === 0) return PARAM_DEFAULTS[name]
    return values.length === 1 ? values[0] : values[index]
  }

  refreshScaleFromShared() {
    if (!this.scaleView) return
    const version = Atomics.load(this.scaleView, SCALE_VERSION_INDEX)
    if (version === this.scaleVersion) return

    const count = this.clamp(Atomics.load(this.scaleView, SCALE_COUNT_INDEX), 1, SCALE_MAX_NOTES)
    const next = []
    for (let index = 0; index < count; index += 1) {
      const note = Atomics.load(this.scaleView, SCALE_NOTES_OFFSET + index)
      if (Number.isFinite(note)) next.push(note)
    }

    if (next.length > 0) {
      this.scaleNotes = next
      this.scaleVersion = version
    }
  }

  hzToMidi(hz) {
    return 69 + 12 * Math.log2(hz / 440)
  }

  snapMidi(midi) {
    let best = this.scaleNotes[0] ?? Math.round(midi)
    let bestDistance = Math.abs(midi - best)

    for (let index = 0; index < this.scaleNotes.length; index += 1) {
      const note = this.scaleNotes[index]
      const distance = Math.abs(midi - note)
      if (distance < bestDistance) {
        bestDistance = distance
        best = note
      }
    }

    return best
  }

  ringSample(index) {
    return this.analysisRing[index & this.analysisMask]
  }

  normalizedCorrelation(lag) {
    const base = this.analysisWrite
    const length = this.analysisSize - lag
    let corr = 0
    let energyA = 0
    let energyB = 0

    for (let index = 0; index < length; index += 1) {
      const a = this.ringSample(base + index)
      const b = this.ringSample(base + index + lag)
      corr += a * b
      energyA += a * a
      energyB += b * b
    }

    const denominator = Math.sqrt(energyA * energyB)
    return denominator > 1e-9 ? corr / denominator : 0
  }

  estimatePitch() {
    const perf = globalThis.performance
    const startedAt = perf?.now ? perf.now() : 0
    let rms = 0
    let peak = 0

    for (let index = 0; index < this.analysisSize; index += 1) {
      const sample = this.ringSample(this.analysisWrite + index)
      const abs = Math.abs(sample)
      peak = Math.max(peak, abs)
      rms += sample * sample
    }

    rms = Math.sqrt(rms / this.analysisSize)
    this.lastRms = rms

    if (rms < 0.004 || peak < 0.018) {
      this.voiceActive = false
      this.lastPitchScore = 0
      this.lastAnalysisMs = startedAt > 0 && perf?.now ? Math.max(0, perf.now() - startedAt) : 0
      return 0
    }

    let bestLag = this.minLag
    let bestScore = -1

    for (let lag = this.minLag; lag <= this.maxLag; lag += 4) {
      const score = this.normalizedCorrelation(lag)
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }

    const refineStart = Math.max(this.minLag, bestLag - 4)
    const refineEnd = Math.min(this.maxLag, bestLag + 4)
    for (let lag = refineStart; lag <= refineEnd; lag += 1) {
      const score = this.normalizedCorrelation(lag)
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }

    if (bestScore < 0.42) {
      this.voiceActive = false
      this.lastPitchScore = bestScore
      this.lastAnalysisMs = startedAt > 0 && perf?.now ? Math.max(0, perf.now() - startedAt) : 0
      return 0
    }

    const left = bestLag > this.minLag ? this.normalizedCorrelation(bestLag - 1) : bestScore
    const center = bestScore
    const right = bestLag < this.maxLag ? this.normalizedCorrelation(bestLag + 1) : bestScore
    const divisor = left + right - 2 * center
    const refinedLag = Math.abs(divisor) > 1e-9 ? bestLag + (left - right) / (2 * divisor) : bestLag
    const hz = sampleRate / refinedLag

    this.voiceActive = hz > 65 && hz < 950
    this.lastPitchScore = bestScore
    this.lastAnalysisMs = startedAt > 0 && perf?.now ? Math.max(0, perf.now() - startedAt) : 0
    return this.voiceActive ? hz : 0
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (!input || !output) return true

    this.refreshScaleFromShared()

    const blockEnabled = this.readParam(parameters, 'enabled', 0) >= 0.5
    const strength = this.clamp(this.readParam(parameters, 'strength', 0), 0, 1)
    const retuneSpeedMs = this.clamp(this.readParam(parameters, 'retuneSpeedMs', 0), 5, 140)
    const humanize = this.clamp(this.readParam(parameters, 'humanize', 0), 0, 1)
    const retuneCoefficient = this.clamp(128 / (sampleRate * (retuneSpeedMs / 1000)), 0.002, 0.72)

    for (let index = 0; index < input.length; index += 1) {
      const sample = input[index]
      this.frame += 1

      this.delay[this.writePos & (this.delay.length - 1)] = sample
      this.writePos += 1

      this.analysisRing[this.analysisWrite] = sample
      this.analysisWrite = (this.analysisWrite + 1) & this.analysisMask
      this.analysisSamples += 1
      this.analysisHop += 1

      if (this.analysisSamples >= this.analysisSize && this.analysisHop >= 256) {
        const hz = this.estimatePitch()
        if (hz > 0) {
          const midi = this.hzToMidi(hz)
          const snapped = this.snapMidi(midi)
          const semitones = (snapped - midi) * strength * (1 - humanize * 0.45)
          this.targetRatio = Math.pow(2, semitones / 12)
          this.lastDetectedHz = hz
          this.lastSnappedMidi = snapped
          this.correctionCents = semitones * 100
        } else {
          this.targetRatio = 1
          this.lastDetectedHz = 0
          this.lastSnappedMidi = 0
          this.correctionCents = 0
        }
        this.analysisHop = 0
      }

      this.pitchRatio += (this.targetRatio - this.pitchRatio) * retuneCoefficient

      if (blockEnabled && Math.abs(this.pitchRatio - 1) > 0.0015) {
        const readIndex = Math.max(0, this.readPos)
        const indexA = Math.floor(readIndex) & (this.delay.length - 1)
        const indexB = (indexA + 1) & (this.delay.length - 1)
        const fraction = readIndex - Math.floor(readIndex)
        const shifted = this.delay[indexA] * (1 - fraction) + this.delay[indexB] * fraction
        const dryBlend = humanize * 0.25
        output[index] = shifted * (1 - dryBlend) + sample * dryBlend
        this.readPos += this.pitchRatio

        const maxRead = this.writePos - 128
        const minRead = this.writePos - 2048
        if (this.readPos > maxRead) this.readPos = this.writePos - 768
        if (this.readPos < minRead) this.readPos = minRead
      } else {
        output[index] = sample
        this.readPos = this.writePos - 768
      }

      this.telemetryFrame += 1
      if (this.telemetryFrame >= 512) {
        this.telemetryFrame = 0
        this.port.postMessage({
          type: 'telemetry',
          frame: this.frame,
          hz: this.lastDetectedHz,
          snapped: this.lastSnappedMidi,
          ratio: this.pitchRatio,
          correctionCents: this.correctionCents,
          inputRms: this.lastRms,
          pitchScore: this.lastPitchScore,
          analysisMs: this.lastAnalysisMs,
          voiceActive: this.voiceActive,
        })
      }
    }

    return true
  }
}

registerProcessor('auto-tune-processor', AutoTuneProcessor)
