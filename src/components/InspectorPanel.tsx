import { Bot, CheckCircle2, GitCompareArrows, Globe2, LineChart, Mic2, Radio, Sparkles, Upload, Users, WandSparkles } from 'lucide-react'
import { AnalysisPanel } from './AnalysisPanel'
import { MicPanel } from './MicPanel'
import { VocalPresetsPanel } from './VocalPresetsPanel'
import { WorldVocalsPanel } from './WorldVocalsPanel'
import type { LatencyCalibrationResult } from '../lib/latencyCalibration'
import type {
  AiLogEntry,
  AutoTuneSettings,
  Clip,
  Collaborator,
  InspectorTab,
  LiveAnalysisState,
  MasterSettings,
  Track,
  VocalPreset,
  WorldVocalEngineState,
  WorldVocalLibrary,
  WorldVocalTransform,
} from '../data/studioData'

interface InspectorPanelProps {
  activeTab: InspectorTab
  aiLog: AiLogEntry[]
  aiPrompt: string
  collaborators: Collaborator[]
  masterSettings: MasterSettings
  masterAB: 'before' | 'after'
  selectedClip: Clip | null
  selectedTrack: Track | null
  tracks: Track[]
  vocalPresets: VocalPreset[]
  activePresetId: string
  worldEngine: WorldVocalEngineState
  worldLibraries: WorldVocalLibrary[]
  worldTransforms: WorldVocalTransform[]
  micDevices: MediaDeviceInfo[]
  selectedMicId: string
  micStatus: string
  micLevel: number
  micMonitor: boolean
  isRecording: boolean
  autoTune: AutoTuneSettings
  detectedNote: string
  targetNote: string
  detectedHz: number
  correctionCents: number
  liveAnalysis: LiveAnalysisState
  projectBpm: number
  projectKey: string
  latency: LatencyCalibrationResult
  onTabChange: (tab: InspectorTab) => void
  onPromptChange: (value: string) => void
  onRunAi: () => void
  onMasterChange: (settings: MasterSettings) => void
  onRunMaster: () => void
  onMasterABToggle: () => void
  onUpload: () => void
  onApplyVocalPreset: (preset: VocalPreset) => void
  onWorldEngineChange: (patch: Partial<WorldVocalEngineState>) => void
  onWorldSwapLayers: () => void
  onCreateWorldTrack: () => void
  onMicSelect: (deviceId: string) => void
  onMicConnect: () => void
  onMicRefresh: () => void
  onMicMonitorChange: (enabled: boolean) => void
  onAutoTuneChange: (settings: AutoTuneSettings) => void
  onCalibrateLatency: () => void
  onRecordToggle: () => void
}

const tabs = [
  { id: 'ai', label: 'AI Mix', icon: Bot },
  { id: 'presets', label: 'Presets', icon: Sparkles },
  { id: 'world', label: 'World', icon: Globe2 },
  { id: 'mastering', label: 'Master', icon: Sparkles },
  { id: 'analysis', label: 'Analyze', icon: LineChart },
  { id: 'mic', label: 'Mic', icon: Mic2 },
  { id: 'collab', label: 'Collab', icon: Users },
  { id: 'clip', label: 'Clip', icon: Radio },
] as const

export function InspectorPanel({
  activeTab,
  aiLog,
  aiPrompt,
  collaborators,
  masterSettings,
  masterAB,
  selectedClip,
  selectedTrack,
  tracks,
  vocalPresets,
  activePresetId,
  worldEngine,
  worldLibraries,
  worldTransforms,
  micDevices,
  selectedMicId,
  micStatus,
  micLevel,
  micMonitor,
  isRecording,
  autoTune,
  detectedNote,
  targetNote,
  detectedHz,
  correctionCents,
  liveAnalysis,
  projectBpm,
  projectKey,
  latency,
  onTabChange,
  onPromptChange,
  onRunAi,
  onMasterChange,
  onRunMaster,
  onMasterABToggle,
  onUpload,
  onApplyVocalPreset,
  onWorldEngineChange,
  onWorldSwapLayers,
  onCreateWorldTrack,
  onMicSelect,
  onMicConnect,
  onMicRefresh,
  onMicMonitorChange,
  onAutoTuneChange,
  onCalibrateLatency,
  onRecordToggle,
}: InspectorPanelProps) {
  return (
    <aside className="inspector-panel">
      <div className="inspector-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              type="button"
              key={tab.id}
              className={activeTab === tab.id ? 'selected' : ''}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'ai' && (
        <section className="inspector-section">
          <div className="panel-heading compact">
            <div>
              <span>AI mix desk</span>
              <strong>Promptable balance and repair</strong>
            </div>
            <WandSparkles size={18} />
          </div>
          <textarea
            value={aiPrompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Example: make the vocal sit forward, tighten the low end, and match a clean streaming master."
          />
          <button type="button" className="action-button" onClick={onRunAi}>
            <Sparkles size={16} />
            Run mix pass
          </button>
          <div className="ai-live-matrix">
            <div>
              <span>Live f0</span>
              <strong>{liveAnalysis.detectedHz > 0 ? `${Math.round(liveAnalysis.detectedHz)} Hz` : 'Listening'}</strong>
            </div>
            <div>
              <span>Tune GR</span>
              <strong>{Math.round(Math.abs(liveAnalysis.correctionCents))} cents</strong>
            </div>
            <div>
              <span>Centroid</span>
              <strong>{liveAnalysis.spectralCentroidHz > 0 ? `${liveAnalysis.spectralCentroidHz} Hz` : '—'}</strong>
            </div>
            <div>
              <span>AI input</span>
              <strong>{liveAnalysis.streamMuted ? 'Muted' : liveAnalysis.voiceActive ? 'Vocal' : 'Idle'}</strong>
            </div>
          </div>
          <div className="ai-log">
            {aiLog.map((entry) => (
              <article key={entry.id}>
                <span>{entry.confidence}%</span>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'mastering' && (
        <section className="inspector-section">
          <div className="segmented">
            {(['easy', 'preset', 'custom'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={masterSettings.mode === mode ? 'selected' : ''}
                onClick={() => onMasterChange({ ...masterSettings, mode })}
              >
                {mode}
              </button>
            ))}
          </div>

          <button type="button" className="reference-slot" onClick={onUpload}>
            <Upload size={17} />
            <span>
              <strong>Reference</strong>
              <small>{masterSettings.reference}</small>
            </span>
          </button>

          <div className="control-stack">
            <label>
              <span>Target LUFS</span>
              <strong>{masterSettings.targetLufs} LUFS</strong>
              <input
                type="range"
                min="-18"
                max="-6"
                value={masterSettings.targetLufs}
                onChange={(event) => onMasterChange({ ...masterSettings, targetLufs: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>True peak</span>
              <strong>{masterSettings.truePeak} dBTP</strong>
              <input
                type="range"
                min="-3"
                max="0"
                step="0.1"
                value={masterSettings.truePeak}
                onChange={(event) => onMasterChange({ ...masterSettings, truePeak: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Stereo width</span>
              <strong>{masterSettings.width}%</strong>
              <input
                type="range"
                min="0"
                max="100"
                value={masterSettings.width}
                onChange={(event) => onMasterChange({ ...masterSettings, width: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="master-grid">
            {[
              ['Spotify', '-14 LUFS', 'safe'],
              ['Apple', '-16 LUFS', 'safe'],
              ['YouTube', '-13 LUFS', 'loud'],
              ['Club', '-8 LUFS', 'ready'],
            ].map(([name, target, state]) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>{target}</span>
                <small>{state}</small>
              </div>
            ))}
          </div>

          <div className="master-actions">
            <button type="button" className={masterAB === 'after' ? 'text-button active' : 'text-button'} onClick={onMasterABToggle}>
              <GitCompareArrows size={15} />
              {masterAB === 'after' ? 'After' : 'Before'}
            </button>
            <button type="button" className="action-button" onClick={onRunMaster}>
              <Sparkles size={16} />
              Render master
            </button>
          </div>
        </section>
      )}

      {activeTab === 'presets' && (
        <VocalPresetsPanel
          presets={vocalPresets}
          activePresetId={activePresetId}
          onApplyPreset={onApplyVocalPreset}
        />
      )}

      {activeTab === 'analysis' && (
        <AnalysisPanel tracks={tracks} masterSettings={masterSettings} liveAnalysis={liveAnalysis} />
      )}

      {activeTab === 'world' && (
        <WorldVocalsPanel
          engine={worldEngine}
          libraries={worldLibraries}
          transforms={worldTransforms}
          projectBpm={projectBpm}
          projectKey={projectKey}
          selectedTrackName={selectedTrack?.name ?? null}
          onEngineChange={onWorldEngineChange}
          onSwapLayers={onWorldSwapLayers}
          onCreateTrack={onCreateWorldTrack}
          onImportSamples={onUpload}
        />
      )}

      {activeTab === 'collab' && (
        <section className="inspector-section">
          <div className="session-card">
            <strong>Remote block session</strong>
            <span>Talkback armed / 24-bit proxy sync / invite locked</span>
            <div className="session-stats">
              <span>18 ms local</span>
              <span>3 peers</span>
              <span>2.4 MB/s</span>
            </div>
          </div>
          <div className="collab-list">
            {collaborators.map((person) => (
              <article key={person.id}>
                <i style={{ background: person.color }} />
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.role}</span>
                </div>
                <small>{person.status} / {person.latencyMs} ms</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'mic' && (
        <MicPanel
          devices={micDevices}
          selectedDeviceId={selectedMicId}
          status={micStatus}
          level={micLevel}
          monitorEnabled={micMonitor}
          isRecording={isRecording}
          autoTune={autoTune}
          detectedNote={detectedNote}
          targetNote={targetNote}
          detectedHz={detectedHz}
          correctionCents={correctionCents}
          liveAnalysis={liveAnalysis}
          projectKey={projectKey}
          latency={latency}
          onSelectDevice={onMicSelect}
          onConnect={onMicConnect}
          onRefresh={onMicRefresh}
          onMonitorChange={onMicMonitorChange}
          onAutoTuneChange={onAutoTuneChange}
          onCalibrateLatency={onCalibrateLatency}
          onRecordToggle={onRecordToggle}
        />
      )}

      {activeTab === 'clip' && (
        <section className="inspector-section">
          {selectedClip && selectedTrack ? (
            <>
              <div className="clip-summary" style={{ '--clip': selectedClip.color } as React.CSSProperties}>
                <span />
                <div>
                  <strong>{selectedClip.name}</strong>
                  <small>{selectedTrack.name} / {selectedClip.lengthBeats} beats</small>
                </div>
              </div>
              <div className="detail-grid">
                <div>
                  <span>Start</span>
                  <strong>{selectedClip.startBeat}</strong>
                </div>
                <div>
                  <span>Gain</span>
                  <strong>{Math.round(selectedClip.gain * 100)}%</strong>
                </div>
                <div>
                  <span>Fade in</span>
                  <strong>{selectedClip.fadeIn}s</strong>
                </div>
                <div>
                  <span>Stretch</span>
                  <strong>{selectedClip.timeStretch}x</strong>
                </div>
              </div>
              <div className="assistant-checks">
                <p><CheckCircle2 size={14} /> Phase-safe against master bus</p>
                <p><CheckCircle2 size={14} /> Clip gain below intersample risk</p>
                <p><CheckCircle2 size={14} /> Warp markers locked to grid</p>
              </div>
            </>
          ) : (
            <div className="empty-state">Select a clip to edit fades, pitch, gain, warp, and repair settings.</div>
          )}
        </section>
      )}
    </aside>
  )
}
