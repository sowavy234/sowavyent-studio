import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Arrangement } from './components/Arrangement'
import { CollaborationStrip } from './components/CollaborationStrip'
import { InspectorPanel } from './components/InspectorPanel'
import { LibraryPanel } from './components/LibraryPanel'
import { Mixer } from './components/Mixer'
import { ModeRail } from './components/ModeRail'
import { TransportBar } from './components/TransportBar'
import {
  buildSongImportProject,
  collaborators,
  initialAiLog,
  initialAutoTuneSettings,
  initialLiveAnalysisState,
  initialMasterSettings,
  initialWorldVocalEngine,
  initialTracks,
  initialTransport,
  loopPacks,
  projectName,
  vocalPresets,
  worldVocalLibraries,
  worldVocalTransforms,
  type AiLogEntry,
  type AutoTuneSettings,
  type Clip,
  type InspectorTab,
  type LiveAnalysisState,
  type MasterSettings,
  type WorldVocalDivision,
  type WorldVocalEngineState,
  type WorldVocalLibrary,
  type Track,
  type TrackType,
  type TransportState,
  type StudioMode,
  type VocalPreset,
} from './data/studioData'
import { StudioAudioEngine, makeProjectExport } from './lib/audioEngine'
import { buildAutoMixMasterPass } from './lib/aiSessionAssistant'
import {
  compensatedStartBeat,
  runLatencyCalibration,
  sanitizeLatencyBaseline,
  type LatencyCalibrationResult,
} from './lib/latencyCalibration'
import { LiveVocalChain, type LiveVocalSettings, type PitchTelemetry, type StreamHealthEvent } from './lib/liveVocalChain'
import { midiToNoteName } from './lib/scaleNotes'

const makeId = (prefix: string) => {
  const random =
    globalThis.crypto && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10)
  return `${prefix}-${random}`
}

const starterWave = (seed: number, count = 36) =>
  Array.from({ length: count }, (_, index) =>
    Number((0.2 + Math.abs(Math.sin((index + 1) * seed * 0.13)) * 0.72).toFixed(2)),
  )

const correctionLoad = (cents: number) => Math.min(1, Math.abs(cents) / 100)

const spectralCentroid = (data: Uint8Array, sampleRate: number) => {
  let weighted = 0
  let magnitude = 0
  const binHz = sampleRate / (data.length * 2)

  for (let index = 0; index < data.length; index += 1) {
    const value = data[index]
    weighted += value * index * binHz
    magnitude += value
  }

  return magnitude > 0 ? Math.round(weighted / magnitude) : 0
}

const worldDivisionBeats: Record<WorldVocalDivision, number> = {
  '1/16': 0.25,
  '1/8': 0.5,
  '1/4': 1,
  '1/2': 2,
  '1 bar': 4,
  '2 bars': 8,
}

function App() {
  const engineRef = useRef(new StudioAudioEngine())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rafRef = useRef<number | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const liveVocalRef = useRef(new LiveVocalChain())
  const micMeterRafRef = useRef<number | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const recordingTrackIdRef = useRef<string>('trk-vocal')
  const recordingStartBeatRef = useRef(0)
  const armMicInputRef = useRef<(options?: { monitor?: boolean }) => Promise<MediaStream | null>>(async () => null)
  const latestPitchRef = useRef<PitchTelemetry | null>(null)
  const telemetryRafRef = useRef<number | null>(null)
  const silentSinceRef = useRef<number | null>(null)
  const lastMeterUiUpdateRef = useRef(0)
  const silenceStatusRef = useRef(false)
  const [tracks, setTracks] = useState<Track[]>(initialTracks)
  const [transport, setTransport] = useState<TransportState>(initialTransport)
  const [masterSettings, setMasterSettings] = useState<MasterSettings>(initialMasterSettings)
  const [aiLog, setAiLog] = useState<AiLogEntry[]>(initialAiLog)
  const [aiPrompt, setAiPrompt] = useState(
    'Make the vocal more expensive, keep the 808 mono, and master for loud streaming without clipping.',
  )
  const [activeMode, setActiveMode] = useState<StudioMode>('studio')
  const [activeTab, setActiveTab] = useState<InspectorTab>('presets')
  const [selectedTrackId, setSelectedTrackId] = useState('trk-vocal')
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-vocal-hook')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [playheadBeat, setPlayheadBeat] = useState(0)
  const [renderStatus, setRenderStatus] = useState('Autosaved')
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState('')
  const [micStatus, setMicStatus] = useState('K688 not armed')
  const [micLevel, setMicLevel] = useState(0)
  const [micMonitor, setMicMonitor] = useState(false)
  const [autoTune, setAutoTune] = useState<AutoTuneSettings>(initialAutoTuneSettings)
  const [detectedPitch, setDetectedPitch] = useState({ hz: 0, note: '—', target: '—', correctionCents: 0 })
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysisState>(initialLiveAnalysisState)
  const [latency, setLatency] = useState<LatencyCalibrationResult>({
    status: 'fallback',
    samples: 0,
    milliseconds: 0,
    confidence: 0,
    detail: 'Not calibrated',
  })
  const [projectTitle, setProjectTitle] = useState(projectName)
  const [activeVocalPresetId, setActiveVocalPresetId] = useState(vocalPresets[0]?.id ?? '')
  const [worldEngine, setWorldEngine] = useState<WorldVocalEngineState>(initialWorldVocalEngine)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [masterAB, setMasterAB] = useState<'before' | 'after'>('after')
  const [isAutoFinishing, setIsAutoFinishing] = useState(false)

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null
  const selectedClip = useMemo(() => {
    for (const track of tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId)
      if (clip) return clip
    }
    return null
  }, [selectedClipId, tracks])
  const activeWorldLayerA = useMemo(
    () => worldVocalLibraries.find((library) => library.id === worldEngine.layerAId) ?? worldVocalLibraries[0] ?? null,
    [worldEngine.layerAId],
  )
  const activeWorldLayerB = useMemo(
    () => worldVocalLibraries.find((library) => library.id === worldEngine.layerBId) ?? worldVocalLibraries[1] ?? worldVocalLibraries[0] ?? null,
    [worldEngine.layerBId],
  )
  const activeWorldTransform = useMemo(
    () => worldVocalTransforms.find((transform) => transform.id === worldEngine.transformId) ?? worldVocalTransforms[0] ?? null,
    [worldEngine.transformId],
  )

  const refreshInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicStatus('Browser microphone API unavailable')
      return []
    }

    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput')
    setMicDevices(devices)

    setSelectedMicId((current) => {
      if (current === '') return ''
      if (current && devices.some((device) => device.deviceId === current)) {
        return current
      }

      const k688 = devices.find((device) => /fifine|k688/i.test(device.label))
      if (k688) return k688.deviceId
      return devices[0]?.deviceId ?? ''
    })

    return devices
  }, [])

  const liveVocalSettings = useMemo<LiveVocalSettings>(
    () => ({
      enabled: autoTune.enabled,
      strength: autoTune.strength,
      retuneSpeed: autoTune.retuneSpeed,
      humanize: autoTune.humanize,
      monitor: micMonitor,
      monitorLevel: 0.42,
      projectKey: transport.key,
    }),
    [autoTune.enabled, autoTune.humanize, autoTune.retuneSpeed, autoTune.strength, micMonitor, transport.key],
  )

  const stopMicMeter = useCallback(() => {
    if (micMeterRafRef.current !== null) {
      window.cancelAnimationFrame(micMeterRafRef.current)
      micMeterRafRef.current = null
    }
    if (telemetryRafRef.current !== null) {
      window.cancelAnimationFrame(telemetryRafRef.current)
      telemetryRafRef.current = null
    }
  }, [])

  const commitPitchTelemetry = useCallback(() => {
    telemetryRafRef.current = null
    const telemetry = latestPitchRef.current
    if (!telemetry) return

    const note = telemetry.hz > 0 ? midiToNoteName(Math.round(69 + 12 * Math.log2(telemetry.hz / 440))) : '—'
    const target = telemetry.snapped > 0 ? midiToNoteName(Math.round(telemetry.snapped)) : '—'

    setDetectedPitch({
      hz: telemetry.hz,
      note,
      target,
      correctionCents: telemetry.correctionCents,
    })
    setLiveAnalysis((current) => ({
      ...current,
      frame: telemetry.frame,
      detectedHz: telemetry.hz,
      targetNote: target,
      correctionCents: telemetry.correctionCents,
      correctionLoad: correctionLoad(telemetry.correctionCents),
      inputRms: telemetry.inputRms,
      pitchConfidence: telemetry.pitchScore,
      workletAnalysisMs: telemetry.analysisMs,
      voiceActive: telemetry.voiceActive,
    }))
  }, [])

  const handlePitchTelemetry = useCallback(
    (telemetry: PitchTelemetry) => {
      latestPitchRef.current = telemetry
      if (telemetryRafRef.current === null) {
        telemetryRafRef.current = window.requestAnimationFrame(commitPitchTelemetry)
      }
    },
    [commitPitchTelemetry],
  )

  const startMicMeter = useCallback(
    (analyser: AnalyserNode) => {
      stopMicMeter()
      const timeData = new Uint8Array(analyser.fftSize)
      const frequencyData = new Uint8Array(analyser.frequencyBinCount)
      const meter = () => {
        analyser.getByteTimeDomainData(timeData)
        analyser.getByteFrequencyData(frequencyData)
        const rms = Math.sqrt(
          timeData.reduce((sum, value) => {
            const normalized = (value - 128) / 128
            return sum + normalized * normalized
          }, 0) / timeData.length,
        )
        const level = Math.min(1, rms * 4)
        const now = performance.now()
        const silent = rms < 0.003

        if (silent) {
          silentSinceRef.current ??= now
          if (now - silentSinceRef.current > 1800 && !silenceStatusRef.current) {
            silenceStatusRef.current = true
            setMicStatus('No input signal — check K688 mute, gain, or cable')
            setLiveAnalysis((current) => ({ ...current, streamMuted: true, voiceActive: false }))
          }
        } else {
          silentSinceRef.current = null
          if (silenceStatusRef.current) {
            silenceStatusRef.current = false
            setMicStatus('Input signal active')
            setLiveAnalysis((current) => ({ ...current, streamMuted: false }))
          }
        }

        if (now - lastMeterUiUpdateRef.current > 48) {
          lastMeterUiUpdateRef.current = now
          setMicLevel(level)
          setLiveAnalysis((current) => ({
            ...current,
            inputRms: Math.max(current.inputRms * 0.82, rms),
            spectralCentroidHz: spectralCentroid(frequencyData, analyser.context.sampleRate),
          }))
        }
        micMeterRafRef.current = window.requestAnimationFrame(meter)
      }
      meter()
    },
    [stopMicMeter],
  )

  const stopMicGraph = useCallback(async () => {
    stopMicMeter()
    liveVocalRef.current.setPitchListener(null)
    liveVocalRef.current.setStreamHealthListener(null)
    await liveVocalRef.current.disconnect(false)
  }, [stopMicMeter])

  const handleStreamHealth = useCallback(
    async (event: StreamHealthEvent) => {
      if (event.type === 'active') {
        setMicStatus(/fifine|k688/i.test(event.label) ? 'FIFINE K688 armed' : 'Input armed')
        setLiveAnalysis((current) => ({ ...current, streamMuted: false }))
        return
      }

      if (event.type === 'muted') {
        setMicStatus('Input stream muted — check K688 mute or cable')
        setLiveAnalysis((current) => ({ ...current, streamMuted: true, voiceActive: false }))
        return
      }

      if (event.type === 'unmuted') {
        silenceStatusRef.current = false
        silentSinceRef.current = null
        setMicStatus(/fifine|k688/i.test(event.label) ? 'FIFINE K688 signal restored' : 'Input signal restored')
        setLiveAnalysis((current) => ({ ...current, streamMuted: false }))
        return
      }

      setMicLevel(0)
      setMicMonitor(false)
      setIsRecording(false)
      setRenderStatus('Mic disconnected — rearm K688')
      setMicStatus('Input disconnected')
      micStreamRef.current = null
      setLiveAnalysis((current) => ({
        ...current,
        detectedHz: 0,
        correctionCents: 0,
        correctionLoad: 0,
        inputRms: 0,
        voiceActive: false,
        streamMuted: true,
      }))
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
      await stopMicGraph()
    },
    [stopMicGraph],
  )

  const rebuildVocalChain = useCallback(
    async (stream: MediaStream, settings = liveVocalSettings) => {
      liveVocalRef.current.setStreamHealthListener((event) => void handleStreamHealth(event))
      const { analyser } = await liveVocalRef.current.connect(stream, settings)
      liveVocalRef.current.setPitchListener(handlePitchTelemetry)
      startMicMeter(analyser)
    },
    [handlePitchTelemetry, handleStreamHealth, liveVocalSettings, startMicMeter],
  )

  const armMicInput = useCallback(async (options: { monitor?: boolean } = {}) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus('Browser microphone API unavailable')
      return null
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId:
          selectedMicId && selectedMicId !== 'default' ? { ideal: selectedMicId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
      },
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
      micStreamRef.current = stream
      const nextSettings = {
        ...liveVocalSettings,
        monitor: options.monitor ?? liveVocalSettings.monitor,
      }
      await rebuildVocalChain(stream, nextSettings)
      const devices = await refreshInputDevices()
      const activeTrack = stream.getAudioTracks()[0]
      const activeLabel = activeTrack?.label || devices.find((device) => device.deviceId === selectedMicId)?.label
      const isK688 = /fifine|k688/i.test(activeLabel ?? '')
      setMicStatus(isK688 ? 'FIFINE K688 armed' : 'Input armed')
      setActiveTab('mic')
      setRenderStatus(isK688 ? 'K688 input armed' : 'Mic input armed')
      if (latency.samples === 0) {
        const context = liveVocalRef.current.getContext()
        if (context) {
          setLatency(
            sanitizeLatencyBaseline({
              milliseconds: (context.baseLatency + (context.outputLatency ?? 0)) * 1000,
              sampleRate: context.sampleRate,
              source: 'Automatic browser',
            }),
          )
        }
      }
      return stream
    } catch (error) {
      setMicStatus(error instanceof Error ? error.message : 'Mic permission denied')
      setRenderStatus('Mic arm failed')
      setActiveTab('mic')
      return null
    }
  }, [latency.samples, liveVocalSettings, rebuildVocalChain, refreshInputDevices, selectedMicId])

  useEffect(() => {
    armMicInputRef.current = armMicInput
  }, [armMicInput])

  useEffect(() => {
    const scanTimer = window.setTimeout(() => {
      void refreshInputDevices()
    }, 0)
    const liveVocal = liveVocalRef.current
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshInputDevices)
    return () => {
      window.clearTimeout(scanTimer)
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshInputDevices)
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
      void stopMicGraph()
      void liveVocal.disconnect(true)
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [refreshInputDevices, stopMicGraph])

  useEffect(() => {
    if (!micStreamRef.current) return
    liveVocalRef.current.applySettings(liveVocalSettings)
  }, [liveVocalSettings])

  useEffect(() => {
    if (!micStreamRef.current || isRecording) return
    void armMicInputRef.current()
  }, [isRecording, selectedMicId])

  useEffect(() => {
    if (!isPlaying) return

    const update = () => {
      const beat = engineRef.current.getBeat(transport)

      if (transport.loopEnabled && beat >= transport.loopEnd) {
        void engineRef.current.play(tracks, transport, transport.loopStart)
        setPlayheadBeat(transport.loopStart)
        rafRef.current = window.requestAnimationFrame(update)
        return
      }

      if (!transport.loopEnabled && beat >= transport.lengthBeats) {
        engineRef.current.stop()
        setIsPlaying(false)
        setPlayheadBeat(transport.lengthBeats)
        setRenderStatus('Playback complete')
        return
      }

      setPlayheadBeat(Math.min(transport.lengthBeats, beat))
      rafRef.current = window.requestAnimationFrame(update)
    }

    rafRef.current = window.requestAnimationFrame(update)
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [isPlaying, tracks, transport])

  const startPlayback = async (fromBeat = playheadBeat) => {
    try {
      setRenderStatus('Playing local Web Audio')
      await engineRef.current.play(
        tracks,
        transport,
        fromBeat,
        transport.loopEnabled
          ? undefined
          : () => {
              setIsPlaying(false)
              setRenderStatus('Playback complete')
            },
      )
      setIsPlaying(true)
    } catch (error) {
      setIsPlaying(false)
      setRenderStatus(error instanceof Error ? error.message : 'Playback failed')
    }
  }

  const stopPlayback = () => {
    engineRef.current.stop()
    setIsPlaying(false)
    setPlayheadBeat(0)
    setRenderStatus('Stopped')
  }

  const handlePlayPause = () => {
    if (isPlaying) {
      engineRef.current.stop()
      setIsPlaying(false)
      setRenderStatus('Paused')
      return
    }

    void startPlayback(playheadBeat)
  }

  const addRecordedMicClip = useCallback((buffer: AudioBuffer, fileName: string, blobSize: number) => {
    const clipId = makeId('k688')
    const trackId = recordingTrackIdRef.current
    const startBeat = compensatedStartBeat({
      rawStartBeat: recordingStartBeatRef.current,
      latencySamples: latency.samples,
      sampleRate: buffer.sampleRate,
      bpm: transport.bpm,
    })
    const lengthBeats = Math.max(1, Math.round(buffer.duration / (60 / transport.bpm)))

    setTracks((current) =>
      current.map((track) => {
        if (track.id !== trackId) return track
        const clip: Clip = {
          id: clipId,
          trackId,
          type: 'audio',
          name: 'FIFINE K688 take',
          startBeat,
          lengthBeats,
          color: track.color,
          gain: 0.82,
          fadeIn: 0.08,
          fadeOut: 0.12,
          pitchShift: 0,
          timeStretch: 1,
          waveform: starterWave(blobSize % 31, 64),
          audioBuffer: buffer,
          fileName,
        }
        return { ...track, clips: [...track.clips, clip], meter: Math.min(1, track.meter + 0.12) }
      }),
    )
    setSelectedTrackId(trackId)
    setSelectedClipId(clipId)
    setActiveTab('clip')
    setRenderStatus('K688 take decoded')
  }, [latency.samples, transport.bpm])

  const startMicRecording = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined') {
      setMicStatus('MediaRecorder unavailable')
      setRenderStatus('Recording unavailable in this browser')
      setActiveTab('mic')
      return
    }

    const stream =
      liveVocalRef.current.getRecordStream() ?? micStreamRef.current ?? (await armMicInput())
    if (!stream) {
      setRenderStatus('Arm K688 before recording')
      setActiveTab('mic')
      return
    }

    const liveTrack = stream.getAudioTracks().find((track) => track.readyState === 'live')
    if (!liveTrack) {
      setMicStatus('Input stream is not live')
      setRenderStatus('Rearm K688 before recording')
      setActiveTab('mic')
      return
    }

    const armedTrack = tracks.find((track) => track.armed && track.type !== 'bus') ?? tracks[0]
    recordingTrackIdRef.current = armedTrack.id
    recordingStartBeatRef.current = Math.floor(playheadBeat / 4) * 4
    recorderChunksRef.current = []

    const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
    let recorder: MediaRecorder

    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MediaRecorder could not start'
      recorderRef.current = null
      setIsRecording(false)
      setActiveTab('mic')
      setMicStatus(message)
      setRenderStatus('Recording unavailable in this browser')
      return
    }

    recorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recorderChunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      setIsRecording(false)
      const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      recorderChunksRef.current = []

      if (blob.size === 0) {
        setRenderStatus('K688 take was empty')
        return
      }

      try {
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `fifine-k688-take.${extension}`, { type: blob.type })
        const buffer = await engineRef.current.decodeFile(file)
        addRecordedMicClip(buffer, file.name, blob.size)
      } catch (error) {
        setRenderStatus(error instanceof Error ? error.message : 'K688 take decode failed')
      }
    }

    try {
      recorder.start()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MediaRecorder start failed'
      recorderRef.current = null
      setIsRecording(false)
      setActiveTab('mic')
      setMicStatus(message)
      setRenderStatus('Recording failed')
      return
    }

    setIsRecording(true)
    setActiveTab('mic')
    setRenderStatus('Recording K688 take')
  }, [addRecordedMicClip, armMicInput, playheadBeat, tracks])

  const runMicCalibration = useCallback(async () => {
    setActiveTab('mic')
    setRenderStatus('Calibrating mic latency')
    const stream = micStreamRef.current ?? (await armMicInput())
    const result = await runLatencyCalibration({
      stream,
      context: liveVocalRef.current.getContext(),
    })
    setLatency(result)
    setRenderStatus(result.samples > 0 ? `ADC ${result.milliseconds} ms` : 'Calibration needs armed mic')
  }, [armMicInput])

  const handleRecord = () => {
    if (isRecording) {
      try {
        recorderRef.current?.stop()
        setRenderStatus('Stopping K688 take')
      } catch (error) {
        setIsRecording(false)
        setRenderStatus(error instanceof Error ? error.message : 'Recording stop failed')
      }
      return
    }

    void startMicRecording()
  }

  const updateTrack = (trackId: string, patch: Partial<Track>) => {
    const target = tracks.find((track) => track.id === trackId)
    if (!target) {
      setRenderStatus('Track unavailable')
      return
    }

    setTracks((current) => current.map((track) => (track.id === trackId ? { ...track, ...patch } : track)))

    if (typeof patch.armed === 'boolean') {
      setRenderStatus(`${target.name} ${patch.armed ? 'armed' : 'disarmed'}`)
    } else if (typeof patch.solo === 'boolean') {
      setRenderStatus(`${target.name} solo ${patch.solo ? 'on' : 'off'}`)
    } else if (typeof patch.muted === 'boolean') {
      setRenderStatus(`${target.name} mute ${patch.muted ? 'on' : 'off'}`)
    } else if (typeof patch.monitoring === 'boolean') {
      setRenderStatus(`${target.name} monitoring ${patch.monitoring ? 'on' : 'off'}`)
    }
  }

  const appendTrackToSession = (track: Track, clipId: string | null = track.clips[0]?.id ?? null) => {
    setTracks((current) => {
      const withoutMaster = current.filter((item) => item.type !== 'bus')
      const master = current.find((item) => item.type === 'bus')
      return master ? [...withoutMaster, track, master] : [...current, track]
    })
    setSelectedTrackId(track.id)
    setSelectedClipId(clipId)
  }

  const pushAiLog = (entry: AiLogEntry, limit = 6) => {
    setAiLog((current) => [entry, ...current].slice(0, limit))
  }

  const buildWorldTextureTrack = (layerA: WorldVocalLibrary, layerB: WorldVocalLibrary) => {
    const trackId = makeId('trk')
    const clipId = makeId('clip')
    const divisionBeats = worldDivisionBeats[worldEngine.division]
    const clipLength = worldEngine.lengthLock ? Math.max(4, Math.round(divisionBeats * 8)) : 16
    const startBeat = snapEnabled ? Math.max(0, Math.round(playheadBeat / 4) * 4) : playheadBeat
    const transformName = activeWorldTransform?.name ?? 'Morph'
    const characterName = `${worldEngine.character.slice(0, 1).toUpperCase()}${worldEngine.character.slice(1)}`
    const waveformSeed = 2 + (worldEngine.blend + worldEngine.morph + worldEngine.cloudDensity + worldEngine.attackSpread) / 26
    const clip: Clip = {
      id: clipId,
      trackId,
      type: 'audio',
      name: `${transformName} ${worldEngine.division} phrases`,
      startBeat,
      lengthBeats: clipLength,
      color: layerA.color,
      gain: Number((0.58 + worldEngine.blend / 250).toFixed(2)),
      fadeIn: Number((0.04 + worldEngine.attackSpread / 500).toFixed(2)),
      fadeOut: Number((0.08 + worldEngine.cloudDensity / 400).toFixed(2)),
      pitchShift: worldEngine.morph > 68 ? -2 : 0,
      timeStretch: worldEngine.bpmSync ? 1 : Number((1 + worldEngine.sampleStartRandomness / 420).toFixed(2)),
      waveform: starterWave(waveformSeed, 64),
    }
    const track: Track = {
      id: trackId,
      type: 'audio',
      name: layerA.id === layerB.id ? `${layerA.name} Texture` : `${layerA.region} x ${layerB.region} Morph`,
      color: layerA.color,
      input: worldEngine.importedSampleReady ? 'World vocal engine / import ready' : 'World vocal engine',
      volume: Number((0.58 + worldEngine.blend / 300).toFixed(2)),
      pan: worldEngine.morph > 52 ? 0.08 : 0,
      meter: Number((0.46 + worldEngine.cloudDensity / 240).toFixed(2)),
      muted: false,
      solo: false,
      armed: false,
      monitoring: true,
      inserts: [
        { id: makeId('insert'), name: `${layerA.region} Layer`, enabled: true, amount: worldEngine.blend },
        { id: makeId('insert'), name: `${layerB.region} Layer`, enabled: true, amount: 100 - worldEngine.blend },
        { id: makeId('insert'), name: transformName, enabled: true, amount: worldEngine.morph },
        { id: makeId('insert'), name: `${characterName} Character`, enabled: true, amount: 74 },
        {
          id: makeId('insert'),
          name: worldEngine.cloudDensity > 32 ? 'Cloud Motion' : 'Tight Phrase Gate',
          enabled: true,
          amount: Math.max(worldEngine.cloudDensity, 28),
        },
        { id: makeId('insert'), name: 'Pitch Glue', enabled: true, amount: 62 },
      ],
      sends: {
        reverb: Number((0.14 + worldEngine.cloudDensity / 180).toFixed(2)),
        delay: Number((0.06 + worldEngine.sampleStartRandomness / 260).toFixed(2)),
      },
      clips: [clip],
    }

    return { track, clipId, trackLabel: track.name, clipLabel: clip.name }
  }

  const addTrack = (type: TrackType) => {
    const color = type === 'audio' ? '#ff6b5f' : type === 'drum' ? '#23d18b' : '#36c9f7'
    const id = makeId('trk')
    const clip: Clip = {
      id: makeId('clip'),
      trackId: id,
      type: type === 'bus' ? 'audio' : type,
      name: type === 'drum' ? 'New kit pattern' : type === 'midi' ? 'New MIDI phrase' : 'New audio region',
      startBeat: 8,
      lengthBeats: 16,
      color,
      gain: 0.68,
      fadeIn: 0.1,
      fadeOut: 0.1,
      pitchShift: 0,
      timeStretch: 1,
      waveform: starterWave(Math.random() * 12 + 2, 48),
      pattern: type === 'drum' ? [1, 0, 3, 0, 2, 0, 3, 0, 1, 0, 4, 0, 2, 3, 0, 5] : undefined,
      notes:
        type === 'midi'
          ? [
              { beat: 0, duration: 0.75, pitch: 60, velocity: 0.6 },
              { beat: 2, duration: 0.75, pitch: 63, velocity: 0.6 },
              { beat: 4, duration: 0.75, pitch: 67, velocity: 0.6 },
            ]
          : undefined,
    }
    const track: Track = {
      id,
      type,
      name: type === 'audio' ? 'Audio Track' : type === 'drum' ? 'Drum Track' : 'Instrument Track',
      color,
      input: type === 'audio' ? 'Imported audio' : type === 'drum' ? 'Step sequencer' : 'MIDI input',
      volume: 0.64,
      pan: 0,
      meter: 0.44,
      muted: false,
      solo: false,
      armed: type === 'audio',
      monitoring: true,
      inserts: [
        { id: makeId('insert'), name: 'AI Balance', enabled: true, amount: 54 },
        { id: makeId('insert'), name: 'EQ', enabled: true, amount: 42 },
        { id: makeId('insert'), name: 'Limiter', enabled: false, amount: 24 },
      ],
      sends: { reverb: 0.16, delay: 0.08 },
      clips: [clip],
    }

    appendTrackToSession(track, clip.id)
    setRenderStatus(`${track.name} added`)
  }

  const loadLibraryPack = (pack: (typeof loopPacks)[number]) => {
    let kind: TrackType = 'audio'
    if (/drum|kit/i.test(pack.type)) {
      kind = 'drum'
    } else if (/midi/i.test(pack.type)) {
      kind = 'midi'
    }

    addTrack(kind)
    setRenderStatus(`${pack.name} loaded as ${kind} track`)
  }

  const updateWorldEngine = (patch: Partial<WorldVocalEngineState>) => {
    setWorldEngine((current) => ({ ...current, ...patch }))

    if (patch.transformId) {
      const transform = worldVocalTransforms.find((item) => item.id === patch.transformId)
      setRenderStatus(`${transform?.name ?? 'World'} transform armed`)
      return
    }

    if (patch.character) {
      setRenderStatus(`${patch.character} character armed`)
      return
    }

    if (patch.division) {
      setRenderStatus(`Phrase division ${patch.division}`)
      return
    }

    if (patch.layerAId || patch.layerBId) {
      setRenderStatus('World vocal layer updated')
      return
    }

    if (typeof patch.bpmSync === 'boolean') {
      setRenderStatus(`BPM sync ${patch.bpmSync ? 'on' : 'off'}`)
      return
    }

    if (typeof patch.lengthLock === 'boolean') {
      setRenderStatus(`Length lock ${patch.lengthLock ? 'on' : 'off'}`)
      return
    }

    if (typeof patch.importedSampleReady === 'boolean') {
      setRenderStatus(patch.importedSampleReady ? 'Import lane armed' : 'Import lane parked')
    }
  }

  const swapWorldLayers = () => {
    setWorldEngine((current) => ({
      ...current,
      layerAId: current.layerBId,
      layerBId: current.layerAId,
    }))
    setActiveTab('world')
    setRenderStatus('World layers swapped')
  }

  const loadWorldLibrary = (library: WorldVocalLibrary) => {
    setWorldEngine((current) => ({ ...current, layerAId: library.id }))
    const { track, clipId, trackLabel, clipLabel } = buildWorldTextureTrack(library, library)
    appendTrackToSession(track, clipId)
    pushAiLog(
      {
        id: makeId('world'),
        title: `${library.name} armed`,
        detail: `Loaded ${clipLabel.toLowerCase()} from ${library.region} with ${activeWorldTransform?.name ?? 'Morph'} transform ready for printing.`,
        confidence: 88,
      },
      6,
    )
    setActiveTab('world')
    setRenderStatus(`${trackLabel} loaded`)
  }

  const createWorldTrack = () => {
    if (!activeWorldLayerA || !activeWorldLayerB) {
      setActiveTab('world')
      setRenderStatus('World vocal layers unavailable')
      return
    }

    const { track, clipId, trackLabel, clipLabel } = buildWorldTextureTrack(activeWorldLayerA, activeWorldLayerB)
    appendTrackToSession(track, clipId)
    pushAiLog(
      {
        id: makeId('world'),
        title: 'World morph printed',
        detail: `${trackLabel} / ${clipLabel} / ${activeWorldTransform?.name ?? 'Morph'} / ${worldEngine.character} character / ${worldEngine.blend}% blend.`,
        confidence: 90,
      },
      6,
    )
    setActiveTab('world')
    setRenderStatus('World morph track printed')
  }

  const addPluginToSelectedTrack = (plugin: string) => {
    const targetTrack = tracks.find((track) => track.id === selectedTrackId)
    if (!targetTrack) {
      setRenderStatus('Select a track before loading plugins')
      return
    }

    const alreadyLoaded = targetTrack.inserts.some((insert) => insert.name === plugin)
    if (alreadyLoaded) {
      setRenderStatus(`${plugin} already on ${targetTrack.name}`)
      return
    }

    setTracks((current) =>
      current.map((track) => {
        if (track.id !== selectedTrackId) return track
        return {
          ...track,
          inserts: [
            ...track.inserts,
            { id: makeId('insert'), name: plugin, enabled: true, amount: 50 },
          ].slice(-6),
        }
      }),
    )
    setRenderStatus(`${plugin} inserted on ${targetTrack.name}`)
  }

  const toggleInsert = (trackId: string, insertId: string) => {
    const track = tracks.find((item) => item.id === trackId)
    const insert = track?.inserts.find((item) => item.id === insertId)
    if (!insert) {
      setRenderStatus('Insert slot unavailable')
      return
    }

    setTracks((current) =>
      current.map((track) =>
        track.id === trackId
          ? {
              ...track,
              inserts: track.inserts.map((insert) =>
                insert.id === insertId ? { ...insert, enabled: !insert.enabled } : insert,
              ),
            }
          : track,
      ),
    )
    setRenderStatus(`${insert.name} ${insert.enabled ? 'bypassed' : 'enabled'}`)
  }

  const splitSelectedClip = () => {
    if (!selectedClipId) {
      setRenderStatus('Select a clip to split')
      return
    }

    let didSplit = false
    setTracks((current) =>
      current.map((track) => {
        const clip = track.clips.find((item) => item.id === selectedClipId)
        if (!clip) return track

        const rawSplitBeat = snapEnabled ? Math.round(playheadBeat) : playheadBeat
        if (rawSplitBeat <= clip.startBeat || rawSplitBeat >= clip.startBeat + clip.lengthBeats) {
          return track
        }

        didSplit = true
        const firstLength = rawSplitBeat - clip.startBeat
        const secondLength = clip.lengthBeats - firstLength
        const first = { ...clip, id: makeId('split'), lengthBeats: firstLength, name: `${clip.name} A` }
        const second = {
          ...clip,
          id: makeId('split'),
          startBeat: rawSplitBeat,
          lengthBeats: secondLength,
          name: `${clip.name} B`,
        }
        return {
          ...track,
          clips: track.clips.flatMap((item) => (item.id === clip.id ? [first, second] : [item])),
        }
      }),
    )
    setRenderStatus(didSplit ? 'Clip split at playhead' : 'Move playhead inside selected clip')
  }

  const toggleSelectedMonitoring = () => {
    const track = tracks.find((item) => item.id === selectedTrackId)
    if (!track) return
    updateTrack(selectedTrackId, { monitoring: !track.monitoring })
    setRenderStatus(`${track.name} monitoring ${track.monitoring ? 'off' : 'on'}`)
  }

  const handleFileInput = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setRenderStatus(`Opening new project from ${file.name}`)

    try {
      engineRef.current.stop()
      setIsPlaying(false)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      recorderChunksRef.current = []
      latestPitchRef.current = null
      setPlayheadBeat(0)

      const buffer = await engineRef.current.decodeFile(file)
      const imported = buildSongImportProject({
        fileName: file.name,
        buffer,
        bpm: transport.bpm,
        key: transport.key,
        makeId,
        waveform: starterWave(file.size % 29, 64),
      })

      const vocalTrack = imported.tracks.find((track) => track.armed && track.type === 'audio')
      const backingClip = imported.tracks.find((track) => track.type === 'audio' && !track.armed)?.clips[0]

      setProjectTitle(imported.projectName)
      setTracks(imported.tracks)
      setTransport(imported.transport)
      setAiLog(imported.aiLog)
      setMasterSettings(initialMasterSettings)
      setAutoTune(initialAutoTuneSettings)
      setActiveVocalPresetId(vocalPresets[0]?.id ?? '')
      setWorldEngine(initialWorldVocalEngine)
      setLiveAnalysis(initialLiveAnalysisState)
      setDetectedPitch({ hz: 0, note: '—', target: '—', correctionCents: 0 })
      setMicMonitor(true)
      setActiveTab('mic')
      setActiveMode('studio')
      setSelectedTrackId(vocalTrack?.id ?? imported.tracks[0].id)
      setSelectedClipId(backingClip?.id ?? null)
      setRenderStatus('New vocal project opened — arm mic and sing over your song')

      void armMicInput({ monitor: true })
    } catch (error) {
      setRenderStatus(error instanceof Error ? error.message : 'Audio import failed')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const runAiMix = () => {
    const liveDetail =
      liveAnalysis.frame > 0
        ? ` Live vocal: ${Math.round(Math.abs(liveAnalysis.correctionCents))} cents tune GR, ${liveAnalysis.spectralCentroidHz || 0} Hz centroid, ${Math.round(liveAnalysis.pitchConfidence * 100)}% pitch lock.`
        : ''
    const worldDetail =
      activeWorldLayerA && activeWorldLayerB
        ? ` World layer: ${activeWorldLayerA.region} x ${activeWorldLayerB.region}, ${worldEngine.blend}% blend, ${activeWorldTransform?.name ?? 'Morph'} transform.`
        : ''
    const entry: AiLogEntry = {
      id: makeId('ai'),
      title: 'Mix pass applied',
      detail:
        aiPrompt.length > 0
          ? `Applied: ${aiPrompt.slice(0, 108)}${aiPrompt.length > 108 ? '...' : ''}${liveDetail}${worldDetail}`
          : `Balanced vocal, low end, and limiter headroom with transparent gain moves.${liveDetail}${worldDetail}`,
      confidence: 89,
    }

    pushAiLog(entry, 5)
    setTracks((current) =>
      current.map((track) => {
        if (track.name.includes('Lead Vocal')) return { ...track, volume: Math.min(1, track.volume + 0.05), meter: 0.66 }
        if (track.name.includes('Sub Bass')) return { ...track, pan: 0, volume: Math.max(0.2, track.volume - 0.02) }
        return track
      }),
    )
    setRenderStatus('AI mix pass applied')
  }

  const runMaster = () => {
    setMasterSettings((current) => ({
      ...current,
      punch: Math.min(100, current.punch + 3),
      air: Math.min(100, current.air + 4),
    }))
    setAiLog((current) => [
      {
        id: makeId('master'),
        title: 'Master render simulated',
        detail: `Target ${masterSettings.targetLufs} LUFS, ${masterSettings.truePeak} dBTP, ${masterSettings.format.toUpperCase()} export chain prepared.`,
        confidence: 92,
      },
      ...current,
    ])
    setRenderStatus('Master chain rendered')
  }

  const applyVocalPreset = (preset: VocalPreset) => {
    setActiveVocalPresetId(preset.id)
    setAutoTune(preset.autoTune)
    setActiveTab('presets')

    setTracks((current) =>
      current.map((track) => {
        if (!/vocal/i.test(track.name) || track.type !== 'audio') return track
        return {
          ...track,
          volume: Math.min(1, Math.max(0.1, track.volume + preset.volumeLift)),
          meter: Math.min(1, Math.max(track.meter, 0.62)),
          inserts: preset.inserts,
          sends: preset.sends,
        }
      }),
    )

    setAiLog((current) => [
      {
        id: makeId('preset'),
        title: `${preset.name} applied`,
        detail: `${preset.influence}: ${preset.inserts.map((insert) => insert.name).slice(0, 4).join(', ')}.`,
        confidence: 90,
      },
      ...current,
    ].slice(0, 6))
    setRenderStatus(`${preset.name} preset applied`)
  }

  const exportSession = () => {
    const payload = makeProjectExport(tracks, transport, masterSettings)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'sowavyent-session.json'
    link.click()
    URL.revokeObjectURL(url)
    setRenderStatus('Session JSON exported')
  }

  const handleTransportChange = useCallback((nextTransport: TransportState) => {
    setTransport(nextTransport)

    if (nextTransport.bpm !== transport.bpm) {
      setRenderStatus(`Tempo ${nextTransport.bpm} BPM`)
      return
    }

    if (nextTransport.key !== transport.key) {
      setRenderStatus(`Project key ${nextTransport.key}`)
      return
    }

    if (nextTransport.timeSignature !== transport.timeSignature) {
      setRenderStatus(`Time signature ${nextTransport.timeSignature}`)
      return
    }

    if (nextTransport.loopEnabled !== transport.loopEnabled) {
      setRenderStatus(`Loop ${nextTransport.loopEnabled ? 'enabled' : 'disabled'}`)
      return
    }

    if (nextTransport.metronome !== transport.metronome) {
      setRenderStatus(`Metronome ${nextTransport.metronome ? 'enabled' : 'disabled'}`)
    }
  }, [transport])

  const handleModeChange = useCallback((mode: StudioMode) => {
    setActiveMode(mode)

    if (mode === 'mix') {
      setActiveTab('ai')
      setRenderStatus('Mix desk focused')
      return
    }

    if (mode === 'master') {
      setActiveTab('mastering')
      setRenderStatus('Master desk focused')
      return
    }

    if (mode === 'library') {
      setActiveTab('world')
      setRenderStatus('Library focus active')
      return
    }

    if (mode === 'collab') {
      setActiveTab('collab')
      setRenderStatus('Collaboration view active')
      return
    }

    if (mode === 'settings') {
      setActiveTab('mic')
      setRenderStatus('Input tools active')
      return
    }

    setActiveTab(selectedClip ? 'clip' : 'presets')
    setRenderStatus('Studio focus active')
  }, [selectedClip])

  const handleInspectorTabChange = useCallback((tab: InspectorTab) => {
    setActiveTab(tab)

    if (tab === 'ai' || tab === 'analysis') {
      setActiveMode('mix')
    } else if (tab === 'mastering') {
      setActiveMode('master')
    } else if (tab === 'world') {
      setActiveMode('library')
    } else if (tab === 'collab') {
      setActiveMode('collab')
    } else if (tab === 'mic') {
      setActiveMode('settings')
    } else {
      setActiveMode('studio')
    }
  }, [])

  const runAutoMixAndMaster = useCallback(async () => {
    if (isAutoFinishing) return

    setIsAutoFinishing(true)
    setActiveMode('mix')
    setActiveTab('ai')
    setRenderStatus('AI is listening to the full session')

    await new Promise((resolve) => window.setTimeout(resolve, 0))

    try {
      const result = buildAutoMixMasterPass({
        autoTune,
        createId: makeId,
        liveAnalysis,
        masterSettings,
        tracks,
        transport,
        worldEngine,
      })

      startTransition(() => {
        setTracks(result.tracks)
        setMasterSettings(result.masterSettings)
        setAutoTune(result.autoTune)
        setAiPrompt(result.recommendedPrompt)
        setAiLog((current) => [...result.logEntries, ...current].slice(0, 6))
        if (result.focusTrackId) setSelectedTrackId(result.focusTrackId)
      })

      setMasterAB('after')
      setRenderStatus(result.status)
    } catch (error) {
      setRenderStatus(error instanceof Error ? error.message : 'AI auto mix + master failed')
    } finally {
      setIsAutoFinishing(false)
    }
  }, [autoTune, isAutoFinishing, liveAnalysis, masterSettings, tracks, transport, worldEngine])

  return (
    <div className="studio-shell">
      <TransportBar
        projectName={projectTitle}
        transport={transport}
        isPlaying={isPlaying}
        playheadBeat={playheadBeat}
        renderStatus={renderStatus}
        isAutoFinishing={isAutoFinishing}
        onPlayPause={handlePlayPause}
        onStop={stopPlayback}
        onRecord={handleRecord}
        onTransportChange={handleTransportChange}
        onAutoMixMaster={runAutoMixAndMaster}
        onUpload={() => fileInputRef.current?.click()}
        onExport={exportSession}
      />

      <div className="studio-grid">
        <ModeRail activeMode={activeMode} onChange={handleModeChange} />
        <LibraryPanel
          onAddTrack={addTrack}
          onUpload={() => fileInputRef.current?.click()}
          onLoadPack={loadLibraryPack}
          onLoadWorldLibrary={loadWorldLibrary}
          onLoadPlugin={addPluginToSelectedTrack}
        />
        <Arrangement
          tracks={tracks}
          transport={transport}
          playheadBeat={playheadBeat}
          selectedClipId={selectedClipId}
          selectedTrackId={selectedTrackId}
          snapEnabled={snapEnabled}
          onSelectClip={(clip, trackId) => {
            setSelectedClipId(clip.id)
            setSelectedTrackId(trackId)
            setActiveTab('clip')
          }}
          onSelectTrack={setSelectedTrackId}
          onTrackUpdate={updateTrack}
          onToggleSnap={() => {
            setSnapEnabled((current) => {
              const next = !current
              setRenderStatus(`Snap ${next ? 'on' : 'off'}`)
              return next
            })
          }}
          onSplitClip={splitSelectedClip}
          onToggleSelectedMonitoring={toggleSelectedMonitoring}
        />
        <InspectorPanel
          activeTab={activeTab}
          aiLog={aiLog}
          aiPrompt={aiPrompt}
          collaborators={collaborators}
          masterSettings={masterSettings}
          masterAB={masterAB}
          selectedClip={selectedClip}
          selectedTrack={selectedTrack}
          tracks={tracks}
          vocalPresets={vocalPresets}
          activePresetId={activeVocalPresetId}
          worldEngine={worldEngine}
          worldLibraries={worldVocalLibraries}
          worldTransforms={worldVocalTransforms}
          micDevices={micDevices}
          selectedMicId={selectedMicId}
          micStatus={micStatus}
          micLevel={micLevel}
          micMonitor={micMonitor}
          isRecording={isRecording}
          autoTune={autoTune}
          detectedNote={detectedPitch.note}
          targetNote={detectedPitch.target}
          detectedHz={detectedPitch.hz}
          correctionCents={detectedPitch.correctionCents}
          liveAnalysis={liveAnalysis}
          projectBpm={transport.bpm}
          projectKey={transport.key}
          latency={latency}
          isAutoFinishing={isAutoFinishing}
          onTabChange={handleInspectorTabChange}
          onPromptChange={setAiPrompt}
          onRunAi={runAiMix}
          onRunAutoMixMaster={runAutoMixAndMaster}
          onMasterChange={setMasterSettings}
          onRunMaster={runMaster}
          onMasterABToggle={() => {
            setMasterAB((current) => (current === 'after' ? 'before' : 'after'))
            setRenderStatus('Master A/B switched')
          }}
          onUpload={() => fileInputRef.current?.click()}
          onApplyVocalPreset={applyVocalPreset}
          onWorldEngineChange={updateWorldEngine}
          onWorldSwapLayers={swapWorldLayers}
          onCreateWorldTrack={createWorldTrack}
          onMicSelect={setSelectedMicId}
          onMicConnect={() => void armMicInput()}
          onMicRefresh={() => void refreshInputDevices()}
          onMicMonitorChange={setMicMonitor}
          onAutoTuneChange={setAutoTune}
          onCalibrateLatency={() => void runMicCalibration()}
          onRecordToggle={handleRecord}
        />
        <CollaborationStrip collaborators={collaborators} />
        <Mixer
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onTrackUpdate={updateTrack}
          onToggleInsert={toggleInsert}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="visually-hidden"
        onChange={(event) => void handleFileInput(event.target.files)}
      />
    </div>
  )
}

export default App
