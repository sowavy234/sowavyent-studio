import { LockKeyhole, MessageSquare, Network, Radio, ShieldCheck, Users } from 'lucide-react'
import type { Collaborator } from '../data/studioData'

interface CollaborationStripProps {
  collaborators: Collaborator[]
}

export function CollaborationStrip({ collaborators }: CollaborationStripProps) {
  return (
    <section className="collaboration-strip">
      <div className="remote-status">
        <Users size={16} />
        <strong>Live room</strong>
        <span>{collaborators.length} connected</span>
      </div>
      <div className="avatar-stack">
        {collaborators.map((person) => (
          <span key={person.id} style={{ background: person.color }} title={`${person.name} - ${person.status}`}>
            {person.name.slice(0, 1)}
          </span>
        ))}
      </div>
      <div className="remote-metrics">
        <span><Radio size={13} /> Talkback ready</span>
        <span><Network size={13} /> Proxy sync 24-bit</span>
        <span><LockKeyhole size={13} /> Invite locked</span>
        <span><ShieldCheck size={13} /> Local audio only</span>
        <span><MessageSquare size={13} /> 5 notes</span>
      </div>
    </section>
  )
}
