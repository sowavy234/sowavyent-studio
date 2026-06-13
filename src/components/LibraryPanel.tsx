import { Drum, Mic2, Piano, Plus, Search, WandSparkles, Zap } from 'lucide-react'
import { loopPacks, pluginRack, type TrackType } from '../data/studioData'

interface LibraryPanelProps {
  onAddTrack: (type: TrackType) => void
  onUpload: () => void
  onLoadPack: (pack: (typeof loopPacks)[number]) => void
  onLoadPlugin: (plugin: string) => void
}

export function LibraryPanel({ onAddTrack, onUpload, onLoadPack, onLoadPlugin }: LibraryPanelProps) {
  return (
    <aside className="library-panel">
      <div className="panel-heading">
        <div>
          <span>Library</span>
          <strong>Loops, tracks, plugins</strong>
        </div>
        <button type="button" className="icon-button" onClick={onUpload} title="Import audio">
          <Plus size={16} />
        </button>
      </div>

      <label className="search-box">
        <Search size={15} />
        <input type="search" placeholder="Search samples, plugins, stems" />
      </label>

      <div className="quick-create">
        <button type="button" onClick={() => onAddTrack('audio')}>
          <Mic2 size={17} />
          Audio
        </button>
        <button type="button" onClick={() => onAddTrack('midi')}>
          <Piano size={17} />
          MIDI
        </button>
        <button type="button" onClick={() => onAddTrack('drum')}>
          <Drum size={17} />
          Drum
        </button>
      </div>

      <section>
        <h2>Loop packs</h2>
        <div className="asset-list">
          {loopPacks.map((pack) => (
            <button type="button" key={pack.name} className="asset-row" onClick={() => onLoadPack(pack)}>
              <span className="asset-icon">
                <Zap size={14} />
              </span>
              <span>
                <strong>{pack.name}</strong>
                <small>
                  {pack.type} / {pack.tempo} BPM / {pack.key}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Mix rack</h2>
        <div className="plugin-grid">
          {pluginRack.map((plugin) => (
            <button type="button" key={plugin} onClick={() => onLoadPlugin(plugin)}>
              <WandSparkles size={13} />
              {plugin}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
