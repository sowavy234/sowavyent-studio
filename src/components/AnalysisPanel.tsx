import { Activity, AudioLines, Gauge, RadioTower } from 'lucide-react'
import type { LiveAnalysisState, MasterSettings, Track } from '../data/studioData'

interface AnalysisPanelProps {
  tracks: Track[]
  masterSettings: MasterSettings
  liveAnalysis: LiveAnalysisState
}

export function AnalysisPanel({ tracks, masterSettings, liveAnalysis }: AnalysisPanelProps) {
  const vocalTrack = tracks.find((track) => /vocal/i.test(track.name))
  const activeTrackCount = tracks.filter((track) => track.type !== 'bus' && !track.muted).length
  const peakRisk = Math.max(...tracks.map((track) => track.meter * track.volume))

  return (
    <section className="inspector-section analysis-section">
      <div className="panel-heading compact">
        <div>
          <span>Mix analysis</span>
          <strong>Mastering and vocal readiness</strong>
        </div>
        <Activity size={18} />
      </div>

      <div className="analysis-grid">
        <div>
          <AudioLines size={15} />
          <span>Active tracks</span>
          <strong>{activeTrackCount}</strong>
        </div>
        <div>
          <Gauge size={15} />
          <span>Peak risk</span>
          <strong>{peakRisk > 0.78 ? 'Watch' : 'Safe'}</strong>
        </div>
        <div>
          <RadioTower size={15} />
          <span>Target</span>
          <strong>{masterSettings.targetLufs} LUFS</strong>
        </div>
        <div>
          <Gauge size={15} />
          <span>Tune GR</span>
          <strong>{Math.round(Math.abs(liveAnalysis.correctionCents))} c</strong>
        </div>
        <div>
          <AudioLines size={15} />
          <span>Centroid</span>
          <strong>{liveAnalysis.spectralCentroidHz || '—'}</strong>
        </div>
        <div>
          <Activity size={15} />
          <span>Vocal</span>
          <strong>{liveAnalysis.streamMuted ? 'Muted' : liveAnalysis.voiceActive ? 'Live' : 'Idle'}</strong>
        </div>
      </div>

      <div className="analysis-lanes">
        {tracks.slice(0, 5).map((track) => (
          <div key={track.id}>
            <span>{track.name}</span>
            <i>
              <b style={{ width: `${Math.round(track.meter * track.volume * 100)}%`, background: track.color }} />
            </i>
            <strong>{Math.round(track.meter * track.volume * 100)}%</strong>
          </div>
        ))}
      </div>

      <div className="analysis-notes">
        <p>Vocal lane: {vocalTrack ? `${vocalTrack.inserts[0]?.name ?? 'Dry'} / ${Math.round(vocalTrack.sends.reverb * 100)} reverb` : 'No vocal track'}</p>
        <p>Live correction: {Math.round(liveAnalysis.correctionCents)} cents / f0 {liveAnalysis.detectedHz > 0 ? `${Math.round(liveAnalysis.detectedHz)} Hz` : 'waiting'} / analysis {liveAnalysis.workletAnalysisMs.toFixed(2)} ms.</p>
        <p>Master chain: true peak {masterSettings.truePeak} dBTP / width {masterSettings.width}% / air {masterSettings.air}%</p>
        <p>Recommendation: keep lead vocals under the limiter by 4-6 dB before final loudness matching.</p>
      </div>
    </section>
  )
}
