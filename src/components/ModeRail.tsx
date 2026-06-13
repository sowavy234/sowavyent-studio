import { Library, Music, Settings, SlidersHorizontal, Sparkles, Users } from 'lucide-react'
import type { StudioMode } from '../data/studioData'

interface ModeRailProps {
  activeMode: StudioMode
  onChange: (mode: StudioMode) => void
}

const modes = [
  { id: 'studio', label: 'Studio', icon: Music },
  { id: 'mix', label: 'Mix', icon: SlidersHorizontal },
  { id: 'master', label: 'Master', icon: Sparkles },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'collab', label: 'Collab', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

export function ModeRail({ activeMode, onChange }: ModeRailProps) {
  return (
    <nav className="mode-rail" aria-label="Studio modes">
      {modes.map((mode, index) => {
        const Icon = mode.icon
        const selected = activeMode === mode.id
        return (
          <button
            type="button"
            key={`${mode.label}-${index}`}
            className={selected ? 'rail-button selected' : 'rail-button'}
            onClick={() => onChange(mode.id)}
            title={mode.label}
            aria-label={mode.label}
          >
            <Icon size={19} />
          </button>
        )
      })}
    </nav>
  )
}
