import { Headphones, SlidersHorizontal, Volume2 } from 'lucide-react'
import type { Track } from '../data/studioData'

interface MixerProps {
  tracks: Track[]
  selectedTrackId: string
  onSelectTrack: (trackId: string) => void
  onTrackUpdate: (trackId: string, patch: Partial<Track>) => void
  onToggleInsert: (trackId: string, insertId: string) => void
}

export function Mixer({ tracks, selectedTrackId, onSelectTrack, onTrackUpdate, onToggleInsert }: MixerProps) {
  return (
    <section className="mixer-panel">
      <div className="mixer-title">
        <SlidersHorizontal size={16} />
        <strong>Mixer</strong>
        <span>Inserts, sends, faders, master bus</span>
      </div>
      <div className="channel-strip-row">
        {tracks.map((track) => (
          <article
            key={track.id}
            className={selectedTrackId === track.id ? 'channel-strip selected' : 'channel-strip'}
            onClick={() => onSelectTrack(track.id)}
          >
            <span className="strip-color" style={{ background: track.color }} />
            <strong>{track.name}</strong>
            <small>{track.type}</small>
            <div className="insert-stack">
              {track.inserts.map((insert) => (
                <button
                  type="button"
                  key={insert.id}
                  className={insert.enabled ? 'enabled' : ''}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleInsert(track.id, insert.id)
                  }}
                >
                  {insert.name}
                </button>
              ))}
            </div>
            <div className="meter">
              <i style={{ height: `${Math.round(track.meter * track.volume * 100)}%` }} />
            </div>
            <label className="fader" onClick={(event) => event.stopPropagation()}>
              <Volume2 size={12} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={track.volume}
                onChange={(event) => onTrackUpdate(track.id, { volume: Number(event.target.value) })}
                aria-label={`${track.name} fader`}
              />
            </label>
            <div className="send-row">
              <span>R {Math.round(track.sends.reverb * 100)}</span>
              <span>D {Math.round(track.sends.delay * 100)}</span>
              {track.monitoring && <Headphones size={12} />}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
