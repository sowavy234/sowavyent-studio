import type { Clip, Track, TransportState } from '../data/studioData'

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12)

const secondsPerBeat = (bpm: number) => 60 / bpm

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export class StudioAudioEngine {
  private context: AudioContext | null = null
  private scheduledNodes: AudioScheduledSourceNode[] = []
  private startedAt = 0
  private startBeat = 0
  private timer: number | null = null

  async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext()
    }

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    return this.context
  }

  async decodeFile(file: File) {
    const context = await this.ensureContext()
    const data = await file.arrayBuffer()
    return context.decodeAudioData(data.slice(0))
  }

  async play(tracks: Track[], transport: TransportState, fromBeat: number, onEnded?: () => void) {
    const context = await this.ensureContext()
    this.stop(true)

    const soloed = tracks.some((track) => track.solo)
    const audibleTracks = tracks.filter((track) => {
      if (track.type === 'bus') return false
      if (track.muted) return false
      return !soloed || track.solo
    })

    const spb = secondsPerBeat(transport.bpm)
    const master = context.createGain()
    master.gain.value = 0.78
    master.connect(context.destination)

    this.startedAt = context.currentTime - fromBeat * spb
    this.startBeat = fromBeat

    audibleTracks.forEach((track) => {
      const gain = context.createGain()
      const pan = context.createStereoPanner()
      const filter = context.createBiquadFilter()
      const compressor = context.createDynamicsCompressor()

      filter.type = 'lowpass'
      filter.frequency.value = track.inserts.some((slot) => slot.enabled && slot.name.includes('Air'))
        ? 9000
        : 15000
      compressor.threshold.value = -18
      compressor.ratio.value = track.inserts.some((slot) => slot.enabled && slot.name.includes('Clipper'))
        ? 6
        : 2.5

      gain.gain.value = clamp(track.volume, 0, 1)
      pan.pan.value = clamp(track.pan, -1, 1)
      gain.connect(filter)
      filter.connect(compressor)
      compressor.connect(pan)
      pan.connect(master)

      track.clips.forEach((clip) => {
        this.scheduleClip(context, gain, clip, transport, fromBeat)
      })
    })

    if (transport.metronome) {
      this.scheduleMetronome(context, master, transport, fromBeat)
    }

    if (onEnded) {
      const remainingBeats = transport.lengthBeats - fromBeat
      this.timer = window.setTimeout(() => onEnded(), Math.max(0, remainingBeats * spb * 1000))
    }
  }

  stop(clearTimer = true) {
    this.scheduledNodes.forEach((node) => {
      try {
        node.stop()
      } catch {
        // Already stopped or not yet startable. Safe to ignore during transport resets.
      }
    })
    this.scheduledNodes = []

    if (clearTimer && this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  getBeat(transport: TransportState) {
    if (!this.context) return this.startBeat
    return (this.context.currentTime - this.startedAt) / secondsPerBeat(transport.bpm)
  }

  private scheduleClip(
    context: AudioContext,
    destination: AudioNode,
    clip: Clip,
    transport: TransportState,
    fromBeat: number,
  ) {
    const spb = secondsPerBeat(transport.bpm)
    const clipEnd = clip.startBeat + clip.lengthBeats
    if (clipEnd <= fromBeat) return

    if (clip.audioBuffer) {
      const source = context.createBufferSource()
      source.buffer = clip.audioBuffer
      source.playbackRate.value = clamp(clip.timeStretch, 0.5, 2)
      const gain = context.createGain()
      gain.gain.value = clip.gain
      source.connect(gain)
      gain.connect(destination)

      const offsetBeats = Math.max(0, fromBeat - clip.startBeat)
      const when = this.startedAt + Math.max(fromBeat, clip.startBeat) * spb
      const offset = offsetBeats * spb
      const duration = Math.min(clip.audioBuffer.duration - offset, (clip.lengthBeats - offsetBeats) * spb)

      if (duration > 0) {
        source.start(Math.max(context.currentTime, when), offset, duration)
        this.scheduledNodes.push(source)
      }
      return
    }

    if (clip.type === 'drum') {
      this.scheduleDrums(context, destination, clip, transport, fromBeat)
      return
    }

    const notes = clip.notes ?? [
      { beat: 0, duration: 0.75, pitch: 60, velocity: 0.5 },
      { beat: 2, duration: 0.75, pitch: 63, velocity: 0.5 },
      { beat: 4, duration: 0.75, pitch: 67, velocity: 0.5 },
    ]

    const repeats = Math.ceil(clip.lengthBeats / 16)
    for (let bar = 0; bar < repeats; bar += 1) {
      notes.forEach((note) => {
        const beat = clip.startBeat + bar * 16 + note.beat
        if (beat < fromBeat || beat >= clipEnd) return
        this.scheduleTone(context, destination, {
          beat,
          duration: Math.min(note.duration, clipEnd - beat),
          frequency: midiToHz(note.pitch + clip.pitchShift),
          velocity: note.velocity * clip.gain,
          wave: clip.trackId.includes('bass') ? 'sawtooth' : 'triangle',
          transport,
        })
      })
    }
  }

  private scheduleDrums(
    context: AudioContext,
    destination: AudioNode,
    clip: Clip,
    transport: TransportState,
    fromBeat: number,
  ) {
    const pattern = clip.pattern ?? [1, 0, 3, 0, 2, 0, 3, 0, 1, 0, 4, 0, 2, 3, 0, 5]
    const stepBeats = 1
    const clipEnd = clip.startBeat + clip.lengthBeats
    const repeats = Math.ceil(clip.lengthBeats / pattern.length)

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      pattern.forEach((hit, step) => {
        if (hit === 0) return
        const beat = clip.startBeat + repeat * pattern.length * stepBeats + step * stepBeats
        if (beat < fromBeat || beat >= clipEnd) return
        const frequency = hit === 1 ? 64 : hit === 2 ? 155 : hit === 3 ? 420 : 760
        this.scheduleTone(context, destination, {
          beat,
          duration: hit === 1 ? 0.34 : 0.12,
          frequency,
          velocity: (hit === 1 ? 0.9 : 0.42) * clip.gain,
          wave: hit === 1 ? 'sine' : 'square',
          transport,
        })
      })
    }
  }

  private scheduleMetronome(
    context: AudioContext,
    destination: AudioNode,
    transport: TransportState,
    fromBeat: number,
  ) {
    for (let beat = Math.floor(fromBeat); beat < transport.lengthBeats; beat += 1) {
      this.scheduleTone(context, destination, {
        beat,
        duration: 0.035,
        frequency: beat % 4 === 0 ? 1320 : 920,
        velocity: beat % 4 === 0 ? 0.12 : 0.07,
        wave: 'square',
        transport,
      })
    }
  }

  private scheduleTone(
    context: AudioContext,
    destination: AudioNode,
    options: {
      beat: number
      duration: number
      frequency: number
      velocity: number
      wave: OscillatorType
      transport: TransportState
    },
  ) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = this.startedAt + options.beat * secondsPerBeat(options.transport.bpm)
    const duration = Math.max(0.03, options.duration * secondsPerBeat(options.transport.bpm))
    const end = start + duration

    oscillator.type = options.wave
    oscillator.frequency.setValueAtTime(options.frequency, start)
    if (options.wave === 'sine' && options.frequency < 100) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(32, options.frequency * 0.55), end)
    }

    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.velocity), start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start(Math.max(context.currentTime, start))
    oscillator.stop(end + 0.02)
    this.scheduledNodes.push(oscillator)
  }
}

export const makeProjectExport = (
  tracks: Track[],
  transport: TransportState,
  master: unknown,
) => ({
  schema: 'sowavyent.session.v1',
  exportedAt: new Date().toISOString(),
  transport,
  master,
  tracks: tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const sanitized = { ...clip }
      delete sanitized.audioBuffer
      return sanitized
    }),
  })),
})
