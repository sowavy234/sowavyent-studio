import { CheckCircle2, Gauge, Headphones, Mic2, Radio, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import type { AutoTuneSettings, LiveAnalysisState } from '../data/studioData'
import type { LatencyCalibrationResult } from '../lib/latencyCalibration'

interface MicPanelProps {
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  status: string
  level: number
  monitorEnabled: boolean
  isRecording: boolean
  autoTune: AutoTuneSettings
  detectedNote: string
  targetNote: string
  detectedHz: number
  correctionCents: number
  liveAnalysis: LiveAnalysisState
  projectKey: string
  latency: LatencyCalibrationResult
  onSelectDevice: (deviceId: string) => void
  onConnect: () => void
  onRefresh: () => void
  onMonitorChange: (enabled: boolean) => void
  onAutoTuneChange: (settings: AutoTuneSettings) => void
  onCalibrateLatency: () => void
  onRecordToggle: () => void
}

const deviceName = (device: MediaDeviceInfo, index: number) =>
  device.label || `Audio input ${index + 1}`

export function MicPanel({
  devices,
  selectedDeviceId,
  status,
  level,
  monitorEnabled,
  isRecording,
  autoTune,
  detectedNote,
  targetNote,
  detectedHz,
  correctionCents,
  liveAnalysis,
  projectKey,
  latency,
  onSelectDevice,
  onConnect,
  onRefresh,
  onMonitorChange,
  onAutoTuneChange,
  onCalibrateLatency,
  onRecordToggle,
}: MicPanelProps) {
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId)
  const k688Detected = devices.some((device) => /fifine|k688/i.test(device.label))
  const displayLevel = Math.round(level * 100)
  const strengthPercent = Math.round(autoTune.strength * 100)
  const humanizePercent = Math.round(autoTune.humanize * 100)
  const correctionLabel = `${correctionCents >= 0 ? '+' : ''}${Math.round(correctionCents)} cents`
  const tuneReduction = Math.round(liveAnalysis.correctionLoad * 100)

  return (
    <section className="inspector-section mic-section">
      <div className="panel-heading compact">
        <div>
          <span>FIFINE K688 input</span>
          <strong>{k688Detected ? 'K688 USB profile detected' : 'USB or XLR interface profile'}</strong>
        </div>
        <Mic2 size={18} />
      </div>

      <div className="mic-status-card">
        <div className="mic-badge">
          <Radio size={15} />
          {status}
        </div>
        <div className="level-meter" aria-label={`Input level ${displayLevel} percent`}>
          <i style={{ width: `${displayLevel}%` }} />
        </div>
        <small>{selectedDevice ? deviceName(selectedDevice, 0) : 'No browser input selected'}</small>
      </div>

      <label className="device-select">
        <span>Input device</span>
        <select value={selectedDeviceId} onChange={(event) => onSelectDevice(event.target.value)}>
          <option value="">Auto-select K688</option>
          {devices.map((device, index) => (
            <option value={device.deviceId} key={device.deviceId || `${device.kind}-${index}`}>
              {deviceName(device, index)}
            </option>
          ))}
        </select>
      </label>

      <div className="mic-actions">
        <button type="button" className="text-button" onClick={onRefresh}>
          <RefreshCw size={15} />
          Rescan
        </button>
        <button type="button" className="action-button" onClick={onConnect}>
          <Mic2 size={16} />
          Arm K688
        </button>
      </div>

      <div className="autotune-card">
        <div className="panel-heading compact">
          <div>
            <span>Live auto-tune</span>
            <strong>Real-time pitch monitor and correction</strong>
          </div>
          <Sparkles size={17} />
        </div>

        <label className="monitor-toggle inline">
          <input
            type="checkbox"
            checked={autoTune.enabled}
            onChange={(event) => onAutoTuneChange({ ...autoTune, enabled: event.target.checked })}
          />
          <span>Enable live auto-tune</span>
        </label>

        <label className="control-stack compact">
          <span>Correction strength</span>
          <strong>{strengthPercent}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={strengthPercent}
            onChange={(event) =>
              onAutoTuneChange({ ...autoTune, strength: Number(event.target.value) / 100 })
            }
          />
        </label>

        <label className="control-stack compact">
          <span>Retune speed</span>
          <strong>{autoTune.retuneSpeed} ms</strong>
          <input
            type="range"
            min="8"
            max="120"
            value={autoTune.retuneSpeed}
            onChange={(event) =>
              onAutoTuneChange({ ...autoTune, retuneSpeed: Number(event.target.value) })
            }
          />
        </label>

        <label className="control-stack compact">
          <span>Humanize</span>
          <strong>{humanizePercent}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={humanizePercent}
            onChange={(event) =>
              onAutoTuneChange({ ...autoTune, humanize: Number(event.target.value) / 100 })
            }
          />
        </label>

        <div className="pitch-readout">
          <div>
            <span>Detected</span>
            <strong>{detectedHz > 0 ? `${detectedNote} / ${Math.round(detectedHz)} Hz` : 'Listening…'}</strong>
          </div>
          <div>
            <span>Target ({projectKey})</span>
            <strong>{autoTune.enabled ? targetNote : 'Bypassed'}</strong>
          </div>
          <div>
            <span>Correction</span>
            <strong>{detectedHz > 0 && autoTune.enabled ? correctionLabel : 'Idle'}</strong>
          </div>
        </div>

        <div className="correction-meter">
          <span>Tune gain reduction</span>
          <i>
            <b style={{ width: `${tuneReduction}%` }} />
          </i>
          <strong>{Math.round(Math.abs(liveAnalysis.correctionCents))} cents</strong>
        </div>

        <div className="worklet-health">
          <span>Worklet {liveAnalysis.workletAnalysisMs.toFixed(2)} ms</span>
          <span>{Math.round(liveAnalysis.pitchConfidence * 100)}% lock</span>
          <span>{liveAnalysis.streamMuted ? 'muted' : liveAnalysis.voiceActive ? 'vocal active' : 'listening'}</span>
        </div>
      </div>

      <div className="latency-card">
        <div>
          <span>Automatic delay compensation</span>
          <strong>{latency.samples > 0 ? `${latency.milliseconds} ms / ${latency.samples} samples` : 'Not calibrated'}</strong>
          <small>{latency.detail}</small>
        </div>
        <button type="button" className="text-button" onClick={onCalibrateLatency}>
          <Gauge size={15} />
          Ping test
        </button>
      </div>

      <label className="monitor-toggle">
        <input
          type="checkbox"
          checked={monitorEnabled}
          onChange={(event) => onMonitorChange(event.target.checked)}
        />
        <span>
          <Headphones size={15} />
          Real-time vocal monitor (auto-tuned when enabled)
        </span>
      </label>

      <button type="button" className={isRecording ? 'record-take active' : 'record-take'} onClick={onRecordToggle}>
        <span />
        {isRecording ? 'Stop K688 take' : 'Record K688 take'}
      </button>

      <div className="k688-checks">
        <p><CheckCircle2 size={14} /> Import a song to open a fresh vocal-over backing project.</p>
        <p><CheckCircle2 size={14} /> USB mode appears as FIFINE Microphone or K688.</p>
        <p><ShieldCheck size={14} /> Monitoring and recorded takes route through live pitch correction and ADC.</p>
      </div>
    </section>
  )
}
