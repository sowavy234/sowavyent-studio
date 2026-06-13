import { CheckCircle2, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { VocalPreset } from '../data/studioData'

interface VocalPresetsPanelProps {
  presets: VocalPreset[]
  activePresetId: string
  onApplyPreset: (preset: VocalPreset) => void
}

const categories = ['lead', 'adlib', 'stack', 'clean', 'special'] as const

export function VocalPresetsPanel({ presets, activePresetId, onApplyPreset }: VocalPresetsPanelProps) {
  return (
    <section className="inspector-section presets-section">
      <div className="panel-heading compact">
        <div>
          <span>Vocal presets</span>
          <strong>Artist-inspired effect chains</strong>
        </div>
        <Sparkles size={18} />
      </div>

      <div className="preset-category-row">
        {categories.map((category) => (
          <span key={category}>{category}</span>
        ))}
      </div>

      <div className="preset-grid">
        {presets.map((preset) => (
          <article
            key={preset.id}
            className={activePresetId === preset.id ? 'preset-card selected' : 'preset-card'}
            style={{ '--preset': preset.color } as React.CSSProperties}
          >
            <div className="preset-card-head">
              <i />
              <div>
                <strong>{preset.name}</strong>
                <span>{preset.influence}</span>
              </div>
            </div>
            <p>{preset.description}</p>
            <div className="preset-tags">
              {preset.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              <span>{preset.autoTune.retuneSpeed} ms retune</span>
              <span>{Math.round(preset.autoTune.humanize * 100)}% human</span>
            </div>
            <div className="preset-chain">
              {preset.inserts.slice(0, 4).map((insert) => (
                <span key={insert.id}>
                  <SlidersHorizontal size={11} />
                  {insert.name}
                </span>
              ))}
            </div>
            <button type="button" className="action-button" onClick={() => onApplyPreset(preset)}>
              <CheckCircle2 size={15} />
              Apply chain
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
