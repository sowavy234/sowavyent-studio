import { ArrowLeftRight, Globe2, Sparkles, Upload } from 'lucide-react'
import type {
  WorldVocalEngineState,
  WorldVocalLibrary,
  WorldVocalTransform,
} from '../data/studioData'

interface WorldVocalsPanelProps {
  engine: WorldVocalEngineState
  libraries: WorldVocalLibrary[]
  transforms: WorldVocalTransform[]
  projectBpm: number
  projectKey: string
  selectedTrackName: string | null
  onEngineChange: (patch: Partial<WorldVocalEngineState>) => void
  onSwapLayers: () => void
  onCreateTrack: () => void
  onImportSamples: () => void
}

export function WorldVocalsPanel({
  engine,
  libraries,
  transforms,
  projectBpm,
  projectKey,
  selectedTrackName,
  onEngineChange,
  onSwapLayers,
  onCreateTrack,
  onImportSamples,
}: WorldVocalsPanelProps) {
  const layerA = libraries.find((library) => library.id === engine.layerAId) ?? libraries[0] ?? null
  const layerB = libraries.find((library) => library.id === engine.layerBId) ?? libraries[1] ?? libraries[0] ?? null
  const activeTransform = transforms.find((transform) => transform.id === engine.transformId) ?? transforms[0] ?? null

  return (
    <section className="inspector-section world-section">
      <div className="panel-heading compact">
        <div>
          <span>World vocals</span>
          <strong>Dual-layer phrase engine</strong>
        </div>
        <Globe2 size={18} />
      </div>

      <article className="world-hero">
        <div>
          <span>Performance recipe</span>
          <strong>
            {layerA?.name ?? 'Layer A'} x {layerB?.name ?? 'Layer B'}
          </strong>
          <p>
            Build tuned phrase beds with tempo-aware slicing, spectral morphing, and fast print-ready
            variation controls.
          </p>
        </div>
        <div className="world-hero-stats">
          <div>
            <span>Tempo</span>
            <strong>{projectBpm} BPM</strong>
          </div>
          <div>
            <span>Key</span>
            <strong>{projectKey}</strong>
          </div>
          <div>
            <span>Target</span>
            <strong>{selectedTrackName ?? 'New texture track'}</strong>
          </div>
        </div>
      </article>

      <div className="world-layer-grid">
        {([['Layer A', layerA, 'layerAId'], ['Layer B', layerB, 'layerBId']] as const).map(([label, layer, field]) => (
          <article
            key={label}
            className="world-layer-card"
            style={{ '--library': layer?.color ?? 'var(--cyan)' } as React.CSSProperties}
          >
            <div className="world-layer-head">
              <span>{label}</span>
              <strong>{layer?.region ?? 'Palette'}</strong>
            </div>
            <select
              value={engine[field]}
              onChange={(event) => onEngineChange({ [field]: event.target.value } as Partial<WorldVocalEngineState>)}
            >
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name}
                </option>
              ))}
            </select>
            <p>{layer?.palette ?? 'Choose a source.'}</p>
            <div className="world-tags">
              {(layer?.tags ?? []).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              {layer ? <span>{layer.tempoRange}</span> : null}
            </div>
          </article>
        ))}
      </div>

      <div className="world-toolbar">
        <button type="button" className="text-button" onClick={onSwapLayers}>
          <ArrowLeftRight size={15} />
          Swap layers
        </button>
        <button type="button" className="text-button" onClick={onImportSamples}>
          <Upload size={15} />
          Import sample
        </button>
        <button type="button" className="action-button world-print-button" onClick={onCreateTrack}>
          <Sparkles size={15} />
          Print morph track
        </button>
      </div>

      <div className="world-switches">
        <label className="monitor-toggle">
          <input
            type="checkbox"
            checked={engine.bpmSync}
            onChange={(event) => onEngineChange({ bpmSync: event.target.checked })}
          />
          <span>BPM sync keeps phrases locked to the project tempo.</span>
        </label>
        <label className="monitor-toggle">
          <input
            type="checkbox"
            checked={engine.lengthLock}
            onChange={(event) => onEngineChange({ lengthLock: event.target.checked })}
          />
          <span>Length lock quantizes phrase playback to musical divisions.</span>
        </label>
        <label className="monitor-toggle">
          <input
            type="checkbox"
            checked={engine.importedSampleReady}
            onChange={(event) => onEngineChange({ importedSampleReady: event.target.checked })}
          />
          <span>Imported sample lane stays hot for drag-and-drop vocal resampling.</span>
        </label>
      </div>

      <section className="world-control-block">
        <div className="world-control-head">
          <span>Length lock</span>
          <strong>{engine.division}</strong>
        </div>
        <div className="world-chip-row">
          {(['1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars'] as const).map((division) => (
            <button
              type="button"
              key={division}
              className={engine.division === division ? 'world-chip selected' : 'world-chip'}
              onClick={() => onEngineChange({ division })}
            >
              {division}
            </button>
          ))}
        </div>
      </section>

      <section className="world-control-block">
        <div className="world-control-head">
          <span>Character mode</span>
          <strong>{engine.character}</strong>
        </div>
        <div className="world-chip-row">
          {(['neutral', 'silk', 'dark', 'edgy'] as const).map((character) => (
            <button
              type="button"
              key={character}
              className={engine.character === character ? 'world-chip selected' : 'world-chip'}
              onClick={() => onEngineChange({ character })}
            >
              {character}
            </button>
          ))}
        </div>
      </section>

      <section className="world-control-block">
        <div className="world-control-head">
          <span>Creative transforms</span>
          <strong>{activeTransform?.name ?? 'Select'}</strong>
        </div>
        <p className="world-transform-note">{activeTransform?.detail ?? 'Choose a transform to reshape the source.'}</p>
        <div className="world-transform-grid">
          {transforms.map((transform) => (
            <button
              type="button"
              key={transform.id}
              className={engine.transformId === transform.id ? 'world-transform selected' : 'world-transform'}
              onClick={() => onEngineChange({ transformId: transform.id })}
              title={transform.detail}
            >
              <strong>{transform.name}</strong>
              <span>{transform.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="control-stack world-slider-stack">
        <label>
          <span>Blend</span>
          <strong>{engine.blend}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={engine.blend}
            onChange={(event) => onEngineChange({ blend: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Spectral morph</span>
          <strong>{engine.morph}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={engine.morph}
            onChange={(event) => onEngineChange({ morph: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Sample start random</span>
          <strong>{engine.sampleStartRandomness}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={engine.sampleStartRandomness}
            onChange={(event) => onEngineChange({ sampleStartRandomness: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Attack spread</span>
          <strong>{engine.attackSpread}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={engine.attackSpread}
            onChange={(event) => onEngineChange({ attackSpread: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Cloud density</span>
          <strong>{engine.cloudDensity}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={engine.cloudDensity}
            onChange={(event) => onEngineChange({ cloudDensity: Number(event.target.value) })}
          />
        </label>
      </div>
    </section>
  )
}
