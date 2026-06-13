import {
  Circle,
  Download,
  Gauge,
  GitCompareArrows,
  Headphones,
  Pause,
  Play,
  Radio,
  Sparkles,
  Square,
  Timer,
  Upload,
} from 'lucide-react'
import type { TransportState } from '../data/studioData'

interface TransportBarProps {
  projectName: string
  transport: TransportState
  isPlaying: boolean
  playheadBeat: number
  renderStatus: string
  isAutoFinishing: boolean
  onPlayPause: () => void
  onStop: () => void
  onRecord: () => void
  onTransportChange: (transport: TransportState) => void
  onAutoMixMaster: () => void
  onUpload: () => void
  onExport: () => void
}

const formatBeat = (beat: number) => {
  const bar = Math.floor(beat / 4) + 1
  const quarter = Math.floor(beat % 4) + 1
  const tick = Math.floor((beat % 1) * 960)
  return `${bar}.${quarter}.${tick.toString().padStart(3, '0')}`
}

export function TransportBar({
  projectName,
  transport,
  isPlaying,
  playheadBeat,
  renderStatus,
  isAutoFinishing,
  onPlayPause,
  onStop,
  onRecord,
  onTransportChange,
  onAutoMixMaster,
  onUpload,
  onExport,
}: TransportBarProps) {
  return (
    <header className="transport-bar">
      <div className="brand-lockup">
        <div className="brand-mark">SW</div>
        <div>
          <strong>SoWavyEnt Studio</strong>
          <span>{projectName}</span>
        </div>
      </div>

      <div className="transport-controls" aria-label="Transport controls">
        <button type="button" className="icon-button record" onClick={onRecord} title="Record armed take">
          <Circle size={16} fill="currentColor" />
        </button>
        <button type="button" className="icon-button primary" onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button type="button" className="icon-button" onClick={onStop} title="Stop">
          <Square size={15} fill="currentColor" />
        </button>
        <button
          type="button"
          className={transport.loopEnabled ? 'icon-button active' : 'icon-button'}
          onClick={() => onTransportChange({ ...transport, loopEnabled: !transport.loopEnabled })}
          title="Loop"
        >
          <GitCompareArrows size={16} />
        </button>
        <button
          type="button"
          className={transport.metronome ? 'icon-button active' : 'icon-button'}
          onClick={() => onTransportChange({ ...transport, metronome: !transport.metronome })}
          title="Metronome"
        >
          <Timer size={16} />
        </button>
      </div>

      <div className="transport-readouts">
        <label>
          <Gauge size={14} />
          <input
            type="number"
            min="50"
            max="220"
            value={transport.bpm}
            onChange={(event) =>
              onTransportChange({ ...transport, bpm: Number(event.target.value) || transport.bpm })
            }
            aria-label="BPM"
          />
          BPM
        </label>
        <label>
          Key
          <select
            value={transport.key}
            onChange={(event) => onTransportChange({ ...transport, key: event.target.value })}
            aria-label="Project key"
          >
            <option>F minor</option>
            <option>C minor</option>
            <option>A minor</option>
            <option>G major</option>
          </select>
        </label>
        <label>
          Sig
          <select
            value={transport.timeSignature}
            onChange={(event) => onTransportChange({ ...transport, timeSignature: event.target.value })}
            aria-label="Time signature"
          >
            <option>4/4</option>
            <option>3/4</option>
            <option>6/8</option>
          </select>
        </label>
        <output>{formatBeat(playheadBeat)}</output>
      </div>

      <div className="transport-actions">
        <span className="render-status">
          <Radio size={14} />
          {renderStatus}
        </span>
        <button type="button" className="text-button" onClick={onUpload}>
          <Upload size={15} />
          Import
        </button>
        <button type="button" className="text-button" onClick={onAutoMixMaster} disabled={isAutoFinishing}>
          <Sparkles size={15} />
          {isAutoFinishing ? 'Listening...' : 'AI Finish'}
        </button>
        <button type="button" className="text-button strong" onClick={onExport}>
          <Download size={15} />
          Export
        </button>
        <Headphones size={18} className="monitor-icon" />
      </div>
    </header>
  )
}
