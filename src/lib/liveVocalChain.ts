import { scaleMidiNotes } from './scaleNotes'

export interface LiveVocalSettings {
  enabled: boolean
  strength: number
  retuneSpeed: number
  humanize: number
  monitor: boolean
  monitorLevel: number
  projectKey: string
}

export interface PitchTelemetry {
  frame: number
  hz: number
  snapped: number
  ratio: number
  correctionCents: number
  inputRms: number
  pitchScore: number
  analysisMs: number
  voiceActive: boolean
}

export type StreamHealthEvent =
  | { type: 'active'; label: string }
  | { type: 'muted'; label: string }
  | { type: 'unmuted'; label: string }
  | { type: 'ended'; label: string }

export interface LiveVocalConnection {
  context: AudioContext
  analyser: AnalyserNode
  monitorGain: GainNode
}

const WORKLET_URL = '/worklets/autoTuneProcessor.js'
const SCALE_BUFFER_NOTES = 64
const SCALE_VERSION_INDEX = 0
const SCALE_COUNT_INDEX = 1
const SCALE_NOTES_OFFSET = 2

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const canShareScaleBuffer = () =>
  typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true

export class LiveVocalChain {
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private analyser: AnalyserNode | null = null
  private monitorGain: GainNode | null = null
  private recordGain: GainNode | null = null
  private recordDest: MediaStreamAudioDestinationNode | null = null
  private monitorAttached = false
  private loadedContexts = new WeakSet<AudioContext>()
  private scaleState: Int32Array | null = null
  private scaleSignature = ''
  private detachTrackListeners: (() => void) | null = null
  private onPitch: ((telemetry: PitchTelemetry) => void) | null = null
  private onStreamHealth: ((event: StreamHealthEvent) => void) | null = null

  async connect(stream: MediaStream, settings: LiveVocalSettings): Promise<LiveVocalConnection> {
    await this.disconnect(false)

    const context = this.context ?? new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
    this.context = context
    if (context.state === 'suspended') await context.resume()
    await this.ensureWorklet(context)

    const source = context.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(context, 'auto-tune-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    const analyser = context.createAnalyser()
    const monitorGain = context.createGain()
    const recordGain = context.createGain()
    const recordDest = context.createMediaStreamDestination()

    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.68

    source.connect(worklet)
    worklet.connect(analyser)
    analyser.connect(monitorGain)
    analyser.connect(recordGain)
    recordGain.connect(recordDest)

    worklet.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== 'telemetry' || !this.onPitch) return
      this.onPitch({
        frame: Number(event.data.frame) || 0,
        hz: Number(event.data.hz) || 0,
        snapped: Number(event.data.snapped) || 0,
        ratio: Number(event.data.ratio) || 1,
        correctionCents: Number(event.data.correctionCents) || 0,
        inputRms: Number(event.data.inputRms) || 0,
        pitchScore: Number(event.data.pitchScore) || 0,
        analysisMs: Number(event.data.analysisMs) || 0,
        voiceActive: Boolean(event.data.voiceActive),
      })
    }

    this.source = source
    this.worklet = worklet
    this.analyser = analyser
    this.monitorGain = monitorGain
    this.recordGain = recordGain
    this.recordDest = recordDest
    this.monitorAttached = false
    this.attachTrackListeners(stream)
    this.setupScaleBuffer()

    this.applySettings(settings, true)
    this.emitStreamHealth('active', stream.getAudioTracks()[0]?.label ?? 'Browser audio input')
    return { context, analyser, monitorGain }
  }

  applySettings(settings: LiveVocalSettings, forceScale = false) {
    if (!this.worklet || !this.monitorGain || !this.recordGain || !this.context) return

    const now = this.context.currentTime
    this.setParam('enabled', settings.enabled ? 1 : 0, now, 0.004)
    this.setParam('strength', clamp(settings.strength, 0, 1), now, 0.012)
    this.setParam('retuneSpeedMs', clamp(settings.retuneSpeed, 5, 140), now, 0.012)
    this.setParam('humanize', clamp(settings.humanize, 0, 1), now, 0.012)
    this.updateScale(settings.projectKey, forceScale)

    this.monitorGain.gain.setTargetAtTime(settings.monitorLevel, now, 0.015)
    this.recordGain.gain.setTargetAtTime(1, now, 0.01)

    if (settings.monitor && !this.monitorAttached) {
      this.monitorGain.connect(this.context.destination)
      this.monitorAttached = true
    } else if (!settings.monitor && this.monitorAttached) {
      this.monitorGain.disconnect(this.context.destination)
      this.monitorAttached = false
    }
  }

  setPitchListener(listener: ((telemetry: PitchTelemetry) => void) | null) {
    this.onPitch = listener
  }

  setStreamHealthListener(listener: ((event: StreamHealthEvent) => void) | null) {
    this.onStreamHealth = listener
  }

  getAnalyser() {
    return this.analyser
  }

  getContext() {
    return this.context
  }

  getInputLatencySeconds() {
    if (!this.context) return 0
    return this.context.baseLatency + (this.context.outputLatency ?? 0)
  }

  getRecordStream() {
    return this.recordDest?.stream ?? null
  }

  async disconnect(closeContext = true) {
    this.detachTrackListeners?.()
    this.detachTrackListeners = null
    this.source?.disconnect()
    this.worklet?.disconnect()
    this.analyser?.disconnect()
    this.monitorGain?.disconnect()
    this.recordGain?.disconnect()
    this.source = null
    this.worklet = null
    this.analyser = null
    this.monitorGain = null
    this.recordGain = null
    this.recordDest = null
    this.monitorAttached = false
    this.onPitch = null
    this.scaleSignature = ''

    if (closeContext && this.context) {
      await this.context.close().catch(() => undefined)
      this.context = null
      this.scaleState = null
    }
  }

  private setParam(name: string, value: number, now: number, timeConstant: number) {
    const param = this.worklet?.parameters.get(name)
    if (!param) return
    param.cancelScheduledValues(now)
    param.setTargetAtTime(value, now, timeConstant)
  }

  private setupScaleBuffer() {
    if (!this.worklet || !canShareScaleBuffer()) return

    if (!this.scaleState) {
      const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * (SCALE_NOTES_OFFSET + SCALE_BUFFER_NOTES))
      this.scaleState = new Int32Array(buffer)
    }

    this.worklet.port.postMessage({ type: 'scaleBuffer', scaleBuffer: this.scaleState.buffer })
  }

  private updateScale(projectKey: string, force = false) {
    if (!this.worklet) return

    const notes = scaleMidiNotes(projectKey, 36, 96)
    const signature = notes.join(',')
    if (!force && signature === this.scaleSignature) return

    this.scaleSignature = signature
    if (this.scaleState) {
      const count = Math.min(notes.length, SCALE_BUFFER_NOTES)
      Atomics.store(this.scaleState, SCALE_COUNT_INDEX, count)
      for (let index = 0; index < count; index += 1) {
        Atomics.store(this.scaleState, SCALE_NOTES_OFFSET + index, notes[index])
      }
      Atomics.add(this.scaleState, SCALE_VERSION_INDEX, 1)
      return
    }

    this.worklet.port.postMessage({ type: 'scale', scaleNotes: notes })
  }

  private attachTrackListeners(stream: MediaStream) {
    const track = stream.getAudioTracks()[0]
    if (!track) return

    const label = track.label || 'Browser audio input'
    const ended = () => this.emitStreamHealth('ended', label)
    const muted = () => this.emitStreamHealth('muted', label)
    const unmuted = () => this.emitStreamHealth('unmuted', label)

    track.addEventListener('ended', ended)
    track.addEventListener('mute', muted)
    track.addEventListener('unmute', unmuted)

    this.detachTrackListeners = () => {
      track.removeEventListener('ended', ended)
      track.removeEventListener('mute', muted)
      track.removeEventListener('unmute', unmuted)
    }
  }

  private emitStreamHealth(type: StreamHealthEvent['type'], label: string) {
    this.onStreamHealth?.({ type, label } as StreamHealthEvent)
  }

  private async ensureWorklet(context: AudioContext) {
    if (this.loadedContexts.has(context)) return
    await context.audioWorklet.addModule(WORKLET_URL)
    this.loadedContexts.add(context)
  }
}
