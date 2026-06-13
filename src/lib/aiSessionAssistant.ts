import type {
  AiLogEntry,
  AutoTuneSettings,
  InsertSlot,
  LiveAnalysisState,
  MasterSettings,
  Track,
  TransportState,
  WorldVocalEngineState,
} from '../data/studioData'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const round = (value: number, precision = 2) => Number(value.toFixed(precision))

const average = (values: number[]) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0)

const isVocalTrack = (track: Track) => /vocal|vox|adlib|hook|lead/i.test(track.name)
const isBassTrack = (track: Track) => /bass|808|sub/i.test(track.name)
const isDrumTrack = (track: Track) => /drum|kick|snare|hat|perc/i.test(track.name)
const isWorldTrack = (track: Track) => /world vocal engine|texture|morph/i.test(`${track.name} ${track.input}`)

const analyzeAudioBuffer = (buffer: AudioBuffer) => {
  const data = buffer.getChannelData(0)
  const step = Math.max(1, Math.floor(data.length / 12000))
  let squared = 0
  let peak = 0
  let brightness = 0
  let samples = 0

  for (let index = step; index < data.length; index += step) {
    const sample = data[index]
    const previous = data[index - step] ?? 0
    const delta = Math.abs(sample - previous)
    squared += sample * sample
    peak = Math.max(peak, Math.abs(sample))
    brightness += delta
    samples += 1
  }

  return {
    energy: samples > 0 ? Math.sqrt(squared / samples) : 0,
    peak,
    brightness: samples > 0 ? clamp((brightness / samples) * 8, 0, 1) : 0.42,
  }
}

const analyzeTrackSignal = (track: Track) => {
  const clipInsights = track.clips.map((clip) => {
    if (clip.audioBuffer) return analyzeAudioBuffer(clip.audioBuffer)

    const waveformMean = average(clip.waveform)
    const brightness = average(clip.waveform.filter((_, index) => index % 2 === 0))
    return {
      energy: waveformMean,
      peak: Math.max(...clip.waveform, 0),
      brightness: clamp(brightness, 0, 1),
    }
  })

  const energy = average(clipInsights.map((clip) => clip.energy)) * track.volume
  const peak = Math.max(...clipInsights.map((clip) => clip.peak), track.meter) * track.volume
  const brightness = average(clipInsights.map((clip) => clip.brightness))

  return {
    track,
    energy: round(energy),
    peak: round(peak),
    brightness: round(brightness),
    hasRecordedAudio: track.clips.some((clip) => Boolean(clip.audioBuffer)),
    isVocal: isVocalTrack(track),
    isBass: isBassTrack(track),
    isDrum: isDrumTrack(track),
    isWorld: isWorldTrack(track),
  }
}

const mergeInsertChain = (
  current: InsertSlot[],
  desired: Array<[string, number]>,
  createId: (prefix: string) => string,
) => {
  const existingByName = new Map(current.map((insert) => [insert.name, insert]))
  const desiredNames = new Set(desired.map(([name]) => name))

  const primary = desired.map(([name, amount]) => {
    const existing = existingByName.get(name)
    if (existing) {
      return { ...existing, enabled: true, amount }
    }

    return {
      id: createId('insert'),
      name,
      enabled: true,
      amount,
    }
  })

  const carry = current.filter((insert) => !desiredNames.has(insert.name)).slice(0, Math.max(0, 6 - primary.length))
  return [...primary, ...carry].slice(0, 6)
}

export interface AutoMixMasterPassResult {
  autoTune: AutoTuneSettings
  focusTrackId: string | null
  logEntries: AiLogEntry[]
  masterSettings: MasterSettings
  recommendedPrompt: string
  status: string
  tracks: Track[]
}

export function buildAutoMixMasterPass(options: {
  autoTune: AutoTuneSettings
  createId: (prefix: string) => string
  liveAnalysis: LiveAnalysisState
  masterSettings: MasterSettings
  tracks: Track[]
  transport: TransportState
  worldEngine: WorldVocalEngineState
}): AutoMixMasterPassResult {
  const { autoTune, createId, liveAnalysis, masterSettings, tracks, transport, worldEngine } = options
  const activeTracks = tracks.filter((track) => track.type !== 'bus' && !track.muted)
  const insights = activeTracks.map(analyzeTrackSignal)
  const vocalInsights = insights.filter((track) => track.isVocal)
  const tonalInsights = insights.filter((track) => !track.isDrum)
  const importedTrackCount = insights.filter((track) => track.hasRecordedAudio).length
  const vocalEnergy = average(vocalInsights.map((track) => track.energy))
  const backingEnergy = average(insights.filter((track) => !track.isVocal).map((track) => track.energy))
  const lowEndWeight = average(insights.filter((track) => track.isBass || track.isDrum).map((track) => track.energy))
  const peakRisk = Math.max(...insights.map((track) => track.peak), 0)
  const stereoSpread = average(activeTracks.map((track) => Math.abs(track.pan)))
  const brightness = average(tonalInsights.map((track) => track.brightness))
  const worldTrackCount = insights.filter((track) => track.isWorld).length
  const vocalBoost = clamp((backingEnergy - vocalEnergy) * 0.22, 0.01, 0.12)
  const bassTrim = lowEndWeight > 0.52 || peakRisk > 0.82 ? 0.05 : 0.02
  const autoTuneStrength = clamp(0.84 + Math.min(0.12, Math.abs(liveAnalysis.correctionCents) / 240), 0.82, 0.98)
  const autoTuneRetuneSpeed = Math.round(clamp(54 - liveAnalysis.pitchConfidence * 18 - Math.abs(liveAnalysis.correctionCents) / 3, 16, 82))
  const autoTuneHumanize = round(clamp(0.08 + (1 - liveAnalysis.pitchConfidence) * 0.18, 0.06, 0.32))
  const targetLufs = round(clamp(-11 + lowEndWeight * 2.2 + worldTrackCount * 0.35 + activeTracks.length * 0.18, -14, -8), 1)
  const width = Math.round(clamp(48 + stereoSpread * 120 + worldTrackCount * 4 - (peakRisk > 0.84 ? 6 : 0), 38, 88))
  const punch = Math.round(clamp(44 + lowEndWeight * 54 + activeTracks.length * 1.5, 38, 92))
  const warmth = Math.round(clamp(38 + (1 - brightness) * 28 + lowEndWeight * 12, 30, 82))
  const air = Math.round(clamp(42 + brightness * 34 + vocalBoost * 120, 36, 86))
  const focusTrackId = vocalInsights[0]?.track.id ?? insights[0]?.track.id ?? null
  const styleDirection =
    worldTrackCount > 0
      ? 'world-vocal detail with controlled width'
      : lowEndWeight > 0.55
        ? 'club-loud low end with centered vocals'
        : 'streaming-clean vocal clarity'

  const nextTracks = tracks.map((track) => {
    if (track.type === 'bus') {
      return {
        ...track,
        volume: round(clamp(track.volume + (peakRisk > 0.84 ? -0.03 : 0.01), 0.62, 0.9)),
        meter: round(clamp(track.meter + 0.04, 0, 1)),
        inserts: mergeInsertChain(
          track.inserts,
          [
            ['AI Auto Master', 86],
            ['Glue Comp', punch],
            ['Dynamic Tone', warmth],
            ['True Peak Guard', 74],
            ['Stereo Refine', width],
            ['Lookahead Limiter', 92],
          ],
          createId,
        ),
      }
    }

    const insight = insights.find((entry) => entry.track.id === track.id)
    if (!insight) return track

    if (insight.isVocal) {
      return {
        ...track,
        volume: round(clamp(track.volume + vocalBoost, 0.24, 0.94)),
        pan: round(track.pan * 0.45),
        meter: round(clamp(track.meter + 0.08, 0, 1)),
        monitoring: true,
        inserts: mergeInsertChain(
          track.inserts,
          [
            ['AI AutoTune', Math.round(autoTuneStrength * 100)],
            ['Dynamic EQ', 66],
            ['Vocal Rider', 72],
            ['De-esser', 60],
            ['Air Lift', air],
            ['Glue Delay', Math.round(clamp(28 + worldTrackCount * 8, 24, 54))],
          ],
          createId,
        ),
        sends: {
          reverb: round(clamp(track.sends.reverb + (worldTrackCount > 0 ? 0.05 : 0.02), 0.18, 0.62)),
          delay: round(clamp(track.sends.delay + (vocalBoost > 0.07 ? 0.04 : 0.02), 0.08, 0.52)),
        },
      }
    }

    if (insight.isBass) {
      return {
        ...track,
        volume: round(clamp(track.volume - bassTrim, 0.22, 0.84)),
        pan: 0,
        meter: round(clamp(track.meter + (lowEndWeight < 0.4 ? 0.04 : 0), 0, 1)),
        inserts: mergeInsertChain(
          track.inserts,
          [
            ['Mono Maker', 88],
            ['Sub Control', 74],
            ['Sidechain', 68],
            ['Bass Saturator', warmth],
          ],
          createId,
        ),
      }
    }

    if (insight.isDrum) {
      return {
        ...track,
        volume: round(clamp(track.volume + (punch > 60 ? 0.03 : 0), 0.32, 0.92)),
        meter: round(clamp(track.meter + 0.04, 0, 1)),
        inserts: mergeInsertChain(
          track.inserts,
          [
            ['Transient', 76],
            ['Drum Glue', punch],
            ['Clipper', peakRisk > 0.84 ? 58 : 42],
          ],
          createId,
        ),
      }
    }

    if (insight.isWorld) {
      return {
        ...track,
        volume: round(clamp(track.volume + 0.02, 0.28, 0.88)),
        pan: round(clamp(track.pan + (worldEngine.morph > 50 ? 0.05 : 0), -0.24, 0.24)),
        meter: round(clamp(track.meter + 0.06, 0, 1)),
        sends: {
          reverb: round(clamp(track.sends.reverb + 0.04, 0.16, 0.58)),
          delay: round(clamp(track.sends.delay + 0.03, 0.08, 0.44)),
        },
      }
    }

    return {
      ...track,
      volume: round(clamp(track.volume + (insight.energy < vocalEnergy ? -0.01 : 0.01), 0.2, 0.9)),
      pan: round(clamp(track.pan * (stereoSpread > 0.2 ? 0.9 : 1), -0.8, 0.8)),
      meter: round(clamp(track.meter + 0.02, 0, 1)),
    }
  })

  const nextMasterSettings: MasterSettings = {
    ...masterSettings,
    mode: 'custom',
    targetLufs,
    truePeak: peakRisk > 0.84 ? -1.1 : -0.9,
    width,
    punch,
    warmth,
    air,
    reference: `${transport.key} / ${transport.bpm} BPM / ${styleDirection}`,
  }

  const nextAutoTune: AutoTuneSettings = {
    enabled: autoTune.enabled || vocalInsights.length > 0,
    strength: round(clamp((autoTune.strength + autoTuneStrength) / 2, 0.52, 0.98), 2),
    retuneSpeed: Math.round(clamp((autoTune.retuneSpeed + autoTuneRetuneSpeed) / 2, 12, 100)),
    humanize: round(clamp((autoTune.humanize + autoTuneHumanize) / 2, 0.04, 0.34)),
  }

  const recommendedPrompt = `Listen to the full session, prioritize the lead vocal, keep the low end clean, and finish for ${styleDirection}.`

  const logEntries: AiLogEntry[] = [
    {
      id: createId('ai'),
      title: 'AI auto mix completed',
      detail: `Scanned ${activeTracks.length} active tracks${importedTrackCount > 0 ? ` and ${importedTrackCount} decoded audio source${importedTrackCount > 1 ? 's' : ''}` : ''}. Lead vocal received ${Math.round(vocalBoost * 100)}% lift, retune ${autoTuneRetuneSpeed} ms, humanize ${Math.round(autoTuneHumanize * 100)}%.`,
      confidence: 94,
    },
    {
      id: createId('master'),
      title: 'AI auto master tuned',
      detail: `Set ${targetLufs} LUFS, ${nextMasterSettings.truePeak} dBTP, width ${width}%, punch ${punch}%, warmth ${warmth}%, air ${air}%. Peak risk ${Math.round(peakRisk * 100)}%.`,
      confidence: 92,
    },
  ]

  return {
    autoTune: nextAutoTune,
    focusTrackId,
    logEntries,
    masterSettings: nextMasterSettings,
    recommendedPrompt,
    status: 'AI auto mix + master applied',
    tracks: nextTracks,
  }
}
