export type TrackType = 'audio' | 'midi' | 'drum' | 'bus'
export type ClipType = 'audio' | 'midi' | 'drum'
export type InspectorTab = 'ai' | 'presets' | 'mastering' | 'analysis' | 'mic' | 'collab' | 'clip'
export type MasterMode = 'easy' | 'preset' | 'custom'
export type StudioMode = 'studio' | 'mix' | 'master' | 'library' | 'collab' | 'settings'

export interface InsertSlot {
  id: string
  name: string
  enabled: boolean
  amount: number
}

export interface ClipNote {
  beat: number
  duration: number
  pitch: number
  velocity: number
}

export interface Clip {
  id: string
  trackId: string
  type: ClipType
  name: string
  startBeat: number
  lengthBeats: number
  color: string
  gain: number
  fadeIn: number
  fadeOut: number
  pitchShift: number
  timeStretch: number
  waveform: number[]
  notes?: ClipNote[]
  pattern?: number[]
  audioBuffer?: AudioBuffer
  fileName?: string
}

export interface Track {
  id: string
  type: TrackType
  name: string
  color: string
  input: string
  volume: number
  pan: number
  meter: number
  muted: boolean
  solo: boolean
  armed: boolean
  monitoring: boolean
  inserts: InsertSlot[]
  sends: {
    reverb: number
    delay: number
  }
  clips: Clip[]
}

export interface TransportState {
  bpm: number
  key: string
  timeSignature: string
  lengthBeats: number
  loopStart: number
  loopEnd: number
  metronome: boolean
  loopEnabled: boolean
}

export interface MasterSettings {
  mode: MasterMode
  targetLufs: number
  truePeak: number
  width: number
  punch: number
  warmth: number
  air: number
  reference: string
  format: 'wav' | 'mp3' | 'flac'
  dither: boolean
}

export interface AiLogEntry {
  id: string
  title: string
  detail: string
  confidence: number
}

export interface Collaborator {
  id: string
  name: string
  role: string
  color: string
  status: 'live' | 'reviewing' | 'idle'
  latencyMs: number
}

export interface AutoTuneSettings {
  enabled: boolean
  strength: number
  retuneSpeed: number
  humanize: number
}

export interface LiveAnalysisState {
  frame: number
  detectedHz: number
  targetNote: string
  correctionCents: number
  correctionLoad: number
  inputRms: number
  spectralCentroidHz: number
  pitchConfidence: number
  workletAnalysisMs: number
  voiceActive: boolean
  streamMuted: boolean
}

export interface VocalPreset {
  id: string
  name: string
  category: 'lead' | 'adlib' | 'stack' | 'clean' | 'special'
  influence: string
  description: string
  color: string
  autoTune: AutoTuneSettings
  volumeLift: number
  inserts: InsertSlot[]
  sends: {
    reverb: number
    delay: number
  }
  tags: string[]
}

export const projectName = 'Neon Session 07'

export const initialAutoTuneSettings: AutoTuneSettings = {
  enabled: true,
  strength: 0.88,
  retuneSpeed: 42,
  humanize: 0.08,
}

export const initialLiveAnalysisState: LiveAnalysisState = {
  frame: 0,
  detectedHz: 0,
  targetNote: '—',
  correctionCents: 0,
  correctionLoad: 0,
  inputRms: 0,
  spectralCentroidHz: 0,
  pitchConfidence: 0,
  workletAnalysisMs: 0,
  voiceActive: false,
  streamMuted: false,
}

export const initialTransport: TransportState = {
  bpm: 142,
  key: 'F minor',
  timeSignature: '4/4',
  lengthBeats: 96,
  loopStart: 16,
  loopEnd: 48,
  metronome: true,
  loopEnabled: true,
}

export const initialMasterSettings: MasterSettings = {
  mode: 'custom',
  targetLufs: -9,
  truePeak: -1,
  width: 62,
  punch: 58,
  warmth: 46,
  air: 52,
  reference: 'Club loud, clean vocal forward',
  format: 'wav',
  dither: true,
}

const wave = (seed: number, count = 36) =>
  Array.from({ length: count }, (_, index) => {
    const sine = Math.abs(Math.sin((index + 1) * (seed * 0.21)))
    const cosine = Math.abs(Math.cos((index + seed) * 0.37))
    return Number(Math.min(0.96, 0.18 + sine * 0.54 + cosine * 0.26).toFixed(2))
  })

const notes = (root: number, pattern: number[], offset = 0): ClipNote[] =>
  pattern.map((step, index) => ({
    beat: offset + index,
    duration: step === 0 ? 0.5 : 0.78,
    pitch: root + step,
    velocity: step === 0 ? 0.62 : 0.78,
  }))

const inserts = (...names: string[]): InsertSlot[] =>
  names.map((name, index) => ({
    id: `${name.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    name,
    enabled: index < 2,
    amount: index === 0 ? 72 : 48,
  }))

export const initialTracks: Track[] = [
  {
    id: 'trk-drums',
    type: 'drum',
    name: 'Drum Rack',
    color: '#23d18b',
    input: 'Step sequencer',
    volume: 0.78,
    pan: 0,
    meter: 0.72,
    muted: false,
    solo: false,
    armed: false,
    monitoring: true,
    inserts: inserts('Transient', 'Clipper', 'Room'),
    sends: { reverb: 0.18, delay: 0.08 },
    clips: [
      {
        id: 'clip-drums-a',
        trackId: 'trk-drums',
        type: 'drum',
        name: 'Trap kit A',
        startBeat: 0,
        lengthBeats: 16,
        color: '#23d18b',
        gain: 0.86,
        fadeIn: 0,
        fadeOut: 0,
        pitchShift: 0,
        timeStretch: 1,
        waveform: wave(3, 48),
        pattern: [1, 0, 3, 0, 2, 0, 3, 0, 1, 0, 4, 0, 2, 3, 0, 5],
      },
      {
        id: 'clip-drums-b',
        trackId: 'trk-drums',
        type: 'drum',
        name: 'Drop variation',
        startBeat: 32,
        lengthBeats: 24,
        color: '#18b97a',
        gain: 0.88,
        fadeIn: 0,
        fadeOut: 0,
        pitchShift: 0,
        timeStretch: 1,
        waveform: wave(8, 60),
        pattern: [1, 0, 3, 6, 2, 0, 3, 0, 1, 0, 4, 0, 2, 3, 5, 6],
      },
    ],
  },
  {
    id: 'trk-bass',
    type: 'midi',
    name: 'Sub Bass',
    color: '#36c9f7',
    input: 'MIDI channel 1',
    volume: 0.72,
    pan: -0.08,
    meter: 0.63,
    muted: false,
    solo: false,
    armed: false,
    monitoring: true,
    inserts: inserts('Mono Maker', 'Saturation', 'Sidechain'),
    sends: { reverb: 0.04, delay: 0.03 },
    clips: [
      {
        id: 'clip-bass-a',
        trackId: 'trk-bass',
        type: 'midi',
        name: '808 movement',
        startBeat: 0,
        lengthBeats: 32,
        color: '#36c9f7',
        gain: 0.76,
        fadeIn: 0,
        fadeOut: 0,
        pitchShift: -12,
        timeStretch: 1,
        waveform: wave(5, 72),
        notes: notes(41, [0, 0, 3, 0, -2, 0, 5, 0, 0, -5, 3, 0, -2, 0, -7, 0]),
      },
    ],
  },
  {
    id: 'trk-vocal',
    type: 'audio',
    name: 'Lead Vocal',
    color: '#ff6b5f',
    input: 'Mic 1',
    volume: 0.68,
    pan: 0.04,
    meter: 0.58,
    muted: false,
    solo: false,
    armed: true,
    monitoring: true,
    inserts: inserts('Auto Pitch', 'De-esser', 'Vocal Air'),
    sends: { reverb: 0.32, delay: 0.24 },
    clips: [
      {
        id: 'clip-vocal-hook',
        trackId: 'trk-vocal',
        type: 'audio',
        name: 'Hook take comp',
        startBeat: 16,
        lengthBeats: 16,
        color: '#ff6b5f',
        gain: 0.82,
        fadeIn: 0.25,
        fadeOut: 0.2,
        pitchShift: 0,
        timeStretch: 1,
        waveform: wave(11, 54),
      },
      {
        id: 'clip-vocal-adlibs',
        trackId: 'trk-vocal',
        type: 'audio',
        name: 'Adlibs stack',
        startBeat: 40,
        lengthBeats: 12,
        color: '#e95851',
        gain: 0.64,
        fadeIn: 0.16,
        fadeOut: 0.2,
        pitchShift: 0,
        timeStretch: 1,
        waveform: wave(14, 42),
      },
    ],
  },
  {
    id: 'trk-keys',
    type: 'midi',
    name: 'Glass Keys',
    color: '#f0c84b',
    input: 'MIDI channel 2',
    volume: 0.54,
    pan: 0.18,
    meter: 0.44,
    muted: false,
    solo: false,
    armed: false,
    monitoring: false,
    inserts: inserts('Chorus', 'Tape Echo', 'Plate'),
    sends: { reverb: 0.44, delay: 0.36 },
    clips: [
      {
        id: 'clip-keys-a',
        trackId: 'trk-keys',
        type: 'midi',
        name: 'Verse arp',
        startBeat: 8,
        lengthBeats: 24,
        color: '#f0c84b',
        gain: 0.62,
        fadeIn: 0.4,
        fadeOut: 0.35,
        pitchShift: 0,
        timeStretch: 1,
        waveform: wave(17, 68),
        notes: notes(65, [0, 3, 7, 10, 12, 10, 7, 3, 0, 3, 8, 10, 15, 10, 8, 3]),
      },
      {
        id: 'clip-keys-b',
        trackId: 'trk-keys',
        type: 'midi',
        name: 'Bridge lift',
        startBeat: 56,
        lengthBeats: 24,
        color: '#dcb63e',
        gain: 0.68,
        fadeIn: 0.3,
        fadeOut: 0.4,
        pitchShift: 0,
        timeStretch: 1,
        waveform: wave(21, 66),
        notes: notes(67, [0, 5, 7, 12, 14, 12, 7, 5, 0, 5, 8, 12, 15, 12, 8, 5]),
      },
    ],
  },
  {
    id: 'trk-master',
    type: 'bus',
    name: 'Master Bus',
    color: '#b9a5ff',
    input: 'Mix bus',
    volume: 0.82,
    pan: 0,
    meter: 0.82,
    muted: false,
    solo: false,
    armed: false,
    monitoring: true,
    inserts: inserts('AI Balance', 'Glue Comp', 'Limiter'),
    sends: { reverb: 0, delay: 0 },
    clips: [],
  },
]

export const initialAiLog: AiLogEntry[] = [
  {
    id: 'ai-1',
    title: 'Vocal pocket detected',
    detail: 'Lead vocal masks 2.8 kHz keys. Suggested -1.5 dB keys dynamic notch during hook.',
    confidence: 91,
  },
  {
    id: 'ai-2',
    title: 'Streaming master target',
    detail: 'Current preview estimates -10.4 LUFS integrated with -1.2 dBTP true peak.',
    confidence: 88,
  },
  {
    id: 'ai-3',
    title: 'Low-end phase check',
    detail: 'Kick and 808 align in the drop. Mono fold-down keeps 94 percent correlation.',
    confidence: 84,
  },
]

export const collaborators: Collaborator[] = [
  { id: 'collab-1', name: 'You', role: 'Owner', color: '#36c9f7', status: 'live', latencyMs: 18 },
  { id: 'collab-2', name: 'Mix Eng', role: 'Mix', color: '#23d18b', status: 'reviewing', latencyMs: 43 },
  { id: 'collab-3', name: 'Artist', role: 'Vocal', color: '#ff6b5f', status: 'idle', latencyMs: 62 },
]

export const loopPacks = [
  { name: 'Midnight vox chops', type: 'Audio loop', tempo: 142, key: 'F min' },
  { name: 'Clean drill hats', type: 'Drum kit', tempo: 142, key: 'Any' },
  { name: 'Glass arp stack', type: 'MIDI phrase', tempo: 142, key: 'F min' },
  { name: 'Analog risers', type: 'One shots', tempo: 140, key: 'C min' },
]

export const pluginRack = [
  'AI Mix Balance',
  'Auto Pitch',
  'Reference Match',
  'Stem Cleaner',
  'Tape Saturator',
  'Multiband Limiter',
  'Spatial Widener',
  'Noise Gate',
]

const presetChain = (names: Array<[string, number]>) =>
  names.map(([name, amount], index) => ({
    id: `${name.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    name,
    enabled: true,
    amount,
  }))

export const vocalPresets: VocalPreset[] = [
  {
    id: 'shimmy-pain-lead',
    name: 'Shimmy Pain Lead',
    category: 'lead',
    influence: 'Loe Shimmy direction',
    description: 'Forward melodic rap lead with hard tune, warm body, plate space, and tucked delay.',
    color: '#ff6b5f',
    autoTune: { enabled: true, strength: 0.92, retuneSpeed: 28, humanize: 0.06 },
    volumeLift: 0.08,
    inserts: presetChain([
      ['Hard Tune', 92],
      ['Pain EQ', 66],
      ['Serial Comp', 72],
      ['Warm Sat', 46],
      ['De-esser', 58],
      ['Plate Verb', 52],
    ]),
    sends: { reverb: 0.42, delay: 0.28 },
    tags: ['melodic', 'pain', 'bright'],
  },
  {
    id: 'astro-space-lead',
    name: 'Astro Space Lead',
    category: 'lead',
    influence: 'Travis Scott direction',
    description: 'Wide atmospheric lead chain with fast tuning, stereo spread, dark delay throws, and air.',
    color: '#b9a5ff',
    autoTune: { enabled: true, strength: 0.96, retuneSpeed: 18, humanize: 0.03 },
    volumeLift: 0.05,
    inserts: presetChain([
      ['Fast Tune', 96],
      ['Dark Shelf', 54],
      ['Opto Comp', 62],
      ['Exciter Air', 58],
      ['Stereo Doubler', 76],
      ['Ping Delay', 68],
    ]),
    sends: { reverb: 0.52, delay: 0.46 },
    tags: ['space', 'wide', 'psychedelic'],
  },
  {
    id: 'dark-trap-doubles',
    name: 'Dark Trap Doubles',
    category: 'stack',
    influence: 'modern trap stack',
    description: 'Thick doubled vocal stack with controlled highs and mid-side width.',
    color: '#36c9f7',
    autoTune: { enabled: true, strength: 0.86, retuneSpeed: 34, humanize: 0.1 },
    volumeLift: 0.03,
    inserts: presetChain([
      ['Tune Lock', 86],
      ['Low Cut', 68],
      ['Stack Comp', 70],
      ['Width Bus', 74],
      ['Sibilance Tame', 55],
      ['Room Glue', 38],
    ]),
    sends: { reverb: 0.28, delay: 0.22 },
    tags: ['double', 'hook', 'width'],
  },
  {
    id: 'radio-rap-clean',
    name: 'Radio Rap Clean',
    category: 'clean',
    influence: 'clean commercial rap',
    description: 'Crisp main vocal with stable dynamics, present consonants, and low noise floor.',
    color: '#23d18b',
    autoTune: { enabled: true, strength: 0.54, retuneSpeed: 72, humanize: 0.22 },
    volumeLift: 0.06,
    inserts: presetChain([
      ['Transparent Tune', 54],
      ['Subtractive EQ', 70],
      ['1176 Control', 60],
      ['LA Smooth', 52],
      ['De-esser', 72],
      ['Air Shelf', 44],
    ]),
    sends: { reverb: 0.2, delay: 0.12 },
    tags: ['clean', 'radio', 'present'],
  },
  {
    id: 'hype-adlib-throw',
    name: 'Hype Adlib Throw',
    category: 'adlib',
    influence: 'festival adlib',
    description: 'Aggressive adlibs with phone band, throw delay, and controlled splash.',
    color: '#f0c84b',
    autoTune: { enabled: true, strength: 0.88, retuneSpeed: 24, humanize: 0.05 },
    volumeLift: -0.04,
    inserts: presetChain([
      ['Hard Tune', 88],
      ['Phone Band', 82],
      ['Fast Gate', 64],
      ['Slam Comp', 68],
      ['Throw Delay', 84],
      ['Hall Tail', 48],
    ]),
    sends: { reverb: 0.5, delay: 0.62 },
    tags: ['adlib', 'throw', 'hype'],
  },
  {
    id: 'intimate-whisper',
    name: 'Intimate Whisper',
    category: 'special',
    influence: 'late-night close vocal',
    description: 'Close, breathy vocal chain with softened sibilance and a short intimate room.',
    color: '#ff8a5c',
    autoTune: { enabled: true, strength: 0.42, retuneSpeed: 92, humanize: 0.3 },
    volumeLift: 0.04,
    inserts: presetChain([
      ['Soft Tune', 42],
      ['Breath Gate', 36],
      ['Velvet EQ', 64],
      ['Soft Comp', 48],
      ['Silky De-ess', 76],
      ['Short Room', 34],
    ]),
    sends: { reverb: 0.18, delay: 0.08 },
    tags: ['soft', 'close', 'rnb'],
  },
  {
    id: 'cloud-chorus',
    name: 'Cloud Chorus',
    category: 'stack',
    influence: 'floating chorus stack',
    description: 'Big hook preset with chorus width, high air, and timed delays for chorus lifts.',
    color: '#7bdff2',
    autoTune: { enabled: true, strength: 0.82, retuneSpeed: 38, humanize: 0.12 },
    volumeLift: 0.05,
    inserts: presetChain([
      ['Tune Lift', 82],
      ['Air EQ', 66],
      ['Glue Comp', 58],
      ['Chorus Width', 76],
      ['Dotted Delay', 70],
      ['Bright Plate', 58],
    ]),
    sends: { reverb: 0.48, delay: 0.44 },
    tags: ['hook', 'chorus', 'wide'],
  },
  {
    id: 'raw-booth-repair',
    name: 'Raw Booth Repair',
    category: 'clean',
    influence: 'home studio cleanup',
    description: 'Repair chain for noisy room takes: gate, low cut, resonant tame, and smooth leveling.',
    color: '#c3f584',
    autoTune: { enabled: true, strength: 0.48, retuneSpeed: 80, humanize: 0.26 },
    volumeLift: 0.02,
    inserts: presetChain([
      ['Noise Gate', 58],
      ['Low Cut', 74],
      ['Resonance Tame', 70],
      ['Level Comp', 55],
      ['De-esser', 64],
      ['Dry Room', 18],
    ]),
    sends: { reverb: 0.12, delay: 0.06 },
    tags: ['cleanup', 'dry', 'repair'],
  },
]

export const createMasterTrack = (): Track => ({
  id: 'trk-master',
  type: 'bus',
  name: 'Master Bus',
  color: '#b9a5ff',
  input: 'Mix bus',
  volume: 0.82,
  pan: 0,
  meter: 0.82,
  muted: false,
  solo: false,
  armed: false,
  monitoring: true,
  inserts: inserts('AI Balance', 'Glue Comp', 'Limiter'),
  sends: { reverb: 0, delay: 0 },
  clips: [],
})

export interface SongImportProject {
  projectName: string
  tracks: Track[]
  transport: TransportState
  aiLog: AiLogEntry[]
}

export function buildSongImportProject(options: {
  fileName: string
  buffer: AudioBuffer
  bpm?: number
  key?: string
  makeId: (prefix: string) => string
  waveform: number[]
}): SongImportProject {
  const { fileName, buffer, makeId, waveform } = options
  const bpm = options.bpm ?? 120
  const key = options.key ?? 'F minor'
  const songName = fileName.replace(/\.[^/.]+$/, '').slice(0, 32)
  const secondsPerBeat = 60 / bpm
  const lengthBeats = Math.max(16, Math.ceil(buffer.duration / secondsPerBeat / 4) * 4)
  const loopEnd = Math.min(lengthBeats, Math.max(16, Math.round(lengthBeats / 2)))

  const backingTrackId = makeId('trk-backing')
  const clipId = makeId('clip-backing')
  const vocalTrackId = makeId('trk-vocal')

  const backingClip: Clip = {
    id: clipId,
    trackId: backingTrackId,
    type: 'audio',
    name: songName,
    startBeat: 0,
    lengthBeats,
    color: '#36c9f7',
    gain: 0.76,
    fadeIn: 0.05,
    fadeOut: 0.12,
    pitchShift: 0,
    timeStretch: 1,
    waveform,
    audioBuffer: buffer,
    fileName,
  }

  const backingTrack: Track = {
    id: backingTrackId,
    type: 'audio',
    name: 'Instrumental / Backing Track',
    color: '#36c9f7',
    input: 'Song import',
    volume: 0.72,
    pan: 0,
    meter: 0.58,
    muted: false,
    solo: false,
    armed: false,
    monitoring: false,
    inserts: inserts('Stem Cleaner', 'EQ', 'Limiter'),
    sends: { reverb: 0.1, delay: 0.06 },
    clips: [backingClip],
  }

  const vocalTrack: Track = {
    id: vocalTrackId,
    type: 'audio',
    name: 'Lead Vocal',
    color: '#ff6b5f',
    input: 'Live K688 / auto-tune',
    volume: 0.7,
    pan: 0,
    meter: 0.42,
    muted: false,
    solo: false,
    armed: true,
    monitoring: true,
    inserts: inserts('Live Auto-Tune', 'De-esser', 'Vocal Air'),
    sends: { reverb: 0.28, delay: 0.18 },
    clips: [],
  }

  return {
    projectName: songName,
    tracks: [backingTrack, vocalTrack, createMasterTrack()],
    transport: {
      bpm,
      key,
      timeSignature: '4/4',
      lengthBeats,
      loopStart: 0,
      loopEnd,
      metronome: false,
      loopEnabled: true,
    },
    aiLog: [
      {
        id: makeId('ai'),
        title: 'New vocal session opened',
        detail: `${songName} loaded as backing track. Live monitor and auto-tune are armed for recording over the song.`,
        confidence: 96,
      },
    ],
  }
}
