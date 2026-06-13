import { Circle, Headphones, Lock, Radio, Scissors, Volume2 } from 'lucide-react'
import type { Clip, Track, TransportState } from '../data/studioData'

interface ArrangementProps {
  tracks: Track[]
  transport: TransportState
  playheadBeat: number
  selectedClipId: string | null
  selectedTrackId: string
  snapEnabled: boolean
  onSelectClip: (clip: Clip, trackId: string) => void
  onSelectTrack: (trackId: string) => void
  onTrackUpdate: (trackId: string, patch: Partial<Track>) => void
  onToggleSnap: () => void
  onSplitClip: () => void
  onToggleSelectedMonitoring: () => void
}

const beatMarkers = Array.from({ length: 13 }, (_, index) => index * 8)

function Waveform({ values }: { values: number[] }) {
  return (
    <div className="waveform" aria-hidden="true">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} style={{ height: `${Math.max(14, value * 56)}%` }} />
      ))}
    </div>
  )
}

export function Arrangement({
  tracks,
  transport,
  playheadBeat,
  selectedClipId,
  selectedTrackId,
  snapEnabled,
  onSelectClip,
  onSelectTrack,
  onTrackUpdate,
  onToggleSnap,
  onSplitClip,
  onToggleSelectedMonitoring,
}: ArrangementProps) {
  const playheadPercent = Math.min(100, Math.max(0, (playheadBeat / transport.lengthBeats) * 100))

  return (
    <main className="arrangement-panel">
      <div className="timeline-toolbar">
        <div>
          <strong>Arrangement</strong>
          <span>
            Grid 1/4 / Loop {transport.loopStart}-{transport.loopEnd} / {tracks.length - 1} tracks
          </span>
        </div>
        <div className="tool-cluster">
          <button
            type="button"
            className={snapEnabled ? 'icon-button active' : 'icon-button'}
            title="Snap"
            onClick={onToggleSnap}
          >
            <Lock size={15} />
          </button>
          <button type="button" className="icon-button" title="Split selected clip at playhead" onClick={onSplitClip}>
            <Scissors size={15} />
          </button>
          <button type="button" className="icon-button" title="Toggle selected input monitoring" onClick={onToggleSelectedMonitoring}>
            <Radio size={15} />
          </button>
        </div>
      </div>

      <div className="timeline" style={{ '--playhead': `${playheadPercent}%` } as React.CSSProperties}>
        <div className="ruler-track-header">Tracks</div>
        <div className="ruler">
          {beatMarkers.map((beat) => (
            <span key={beat} style={{ left: `${(beat / transport.lengthBeats) * 100}%` }}>
              {beat === 0 ? '1' : `${Math.floor(beat / 4) + 1}`}
            </span>
          ))}
        </div>
        <div className="playhead" />

        {tracks
          .filter((track) => track.type !== 'bus')
          .map((track) => (
            <div
              className={selectedTrackId === track.id ? 'track-row selected' : 'track-row'}
              key={track.id}
              onClick={() => onSelectTrack(track.id)}
            >
              <div className="track-header">
                <div className="track-color" style={{ background: track.color }} />
                <div className="track-title">
                  <strong>{track.name}</strong>
                  <span>{track.input}</span>
                </div>
                <div className="track-buttons">
                  <button
                    type="button"
                    className={track.armed ? 'mini-button armed' : 'mini-button'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onTrackUpdate(track.id, { armed: !track.armed })
                    }}
                  >
                    <Circle size={10} fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    className={track.solo ? 'mini-button active' : 'mini-button'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onTrackUpdate(track.id, { solo: !track.solo })
                    }}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    className={track.muted ? 'mini-button active' : 'mini-button'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onTrackUpdate(track.id, { muted: !track.muted })
                    }}
                  >
                    M
                  </button>
                </div>
                <div className="track-volume">
                  <Volume2 size={12} />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={track.volume}
                    onChange={(event) => onTrackUpdate(track.id, { volume: Number(event.target.value) })}
                    aria-label={`${track.name} volume`}
                  />
                </div>
              </div>

              <div className="clip-lane">
                {beatMarkers.map((beat) => (
                  <i key={beat} className="grid-line" style={{ left: `${(beat / transport.lengthBeats) * 100}%` }} />
                ))}
                {track.clips.map((clip) => (
                  <button
                    type="button"
                    key={clip.id}
                    className={selectedClipId === clip.id ? 'clip selected' : 'clip'}
                    style={{
                      left: `${(clip.startBeat / transport.lengthBeats) * 100}%`,
                      width: `${(clip.lengthBeats / transport.lengthBeats) * 100}%`,
                      '--clip': clip.color,
                    } as React.CSSProperties}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectClip(clip, track.id)
                    }}
                  >
                    <span className="clip-name">{clip.name}</span>
                    <Waveform values={clip.waveform} />
                  </button>
                ))}
                {track.monitoring && (
                  <span className="monitor-pill">
                    <Headphones size={12} />
                    monitor
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </main>
  )
}
