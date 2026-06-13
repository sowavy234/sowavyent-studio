const ROOT_SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10]
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11]

export function scaleMidiNotes(key: string, lowMidi = 48, highMidi = 84): number[] {
  const [rootToken, modeToken = 'major'] = key.trim().split(/\s+/)
  const root = ROOT_SEMITONE[rootToken] ?? 5
  const intervals = /minor|min/i.test(modeToken) ? MINOR_INTERVALS : MAJOR_INTERVALS
  const notes = new Set<number>()

  for (let midi = lowMidi; midi <= highMidi; midi += 1) {
    const semitone = ((midi % 12) - root + 12) % 12
    if (intervals.includes(semitone)) notes.add(midi)
  }

  return [...notes].sort((a, b) => a - b)
}

export function midiToNoteName(midi: number) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midi / 12) - 1
  return `${names[((midi % 12) + 12) % 12]}${octave}`
}
