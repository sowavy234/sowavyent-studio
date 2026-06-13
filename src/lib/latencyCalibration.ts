export interface LatencyCalibrationResult {
  status: 'ok' | 'fallback'
  samples: number
  milliseconds: number
  confidence: number
  detail: string
}

const FALLBACK_LATENCY_MS = 12
const MIN_REASONABLE_LATENCY_MS = 1
const MAX_REASONABLE_LATENCY_MS = 180

const roundLatency = (milliseconds: number, sampleRate: number, status: LatencyCalibrationResult['status'], detail: string) => ({
  status,
  samples: Math.max(0, Math.round((milliseconds / 1000) * sampleRate)),
  milliseconds: Number(milliseconds.toFixed(2)),
  confidence: status === 'ok' ? 0.82 : 0.48,
  detail,
})

export function sanitizeLatencyBaseline(options: {
  milliseconds: number
  sampleRate: number
  source: string
}): LatencyCalibrationResult {
  const { milliseconds, sampleRate, source } = options
  const valid =
    Number.isFinite(milliseconds) &&
    milliseconds >= MIN_REASONABLE_LATENCY_MS &&
    milliseconds <= MAX_REASONABLE_LATENCY_MS &&
    Number.isFinite(sampleRate) &&
    sampleRate > 0

  if (!valid) {
    return roundLatency(
      FALLBACK_LATENCY_MS,
      Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48000,
      'fallback',
      `${source} reported an unsafe latency value. Using ${FALLBACK_LATENCY_MS} ms hardware-safe baseline.`,
    )
  }

  return roundLatency(milliseconds, sampleRate, 'ok', `${source} latency baseline.`)
}

export async function runLatencyCalibration(options: {
  stream: MediaStream | null
  context: AudioContext | null
}): Promise<LatencyCalibrationResult> {
  const { stream, context } = options

  if (!context || !stream) {
    return {
      status: 'fallback',
      samples: 0,
      milliseconds: 0,
      confidence: 0,
      detail: 'Arm the mic before running calibration.',
    }
  }

  if (context.state === 'suspended') await context.resume()

  const reportedMs = (context.baseLatency + (context.outputLatency ?? 0)) * 1000
  const baseline = sanitizeLatencyBaseline({
    milliseconds: reportedMs,
    sampleRate: context.sampleRate,
    source: 'AudioContext',
  })

  if (baseline.status === 'fallback') return baseline

  return {
    ...baseline,
    status: 'fallback',
    confidence: 0.72,
    detail:
      'Browser-safe calibration from AudioContext base/output latency. Hardware loopback ping needs a physical loopback path.',
  }
}

export function compensatedStartBeat(options: {
  rawStartBeat: number
  latencySamples: number
  sampleRate: number
  bpm: number
}) {
  if (!Number.isFinite(options.latencySamples) || !Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
    return Math.max(0, options.rawStartBeat)
  }

  const latencySeconds = Math.max(0, options.latencySamples) / options.sampleRate
  const latencyBeats = latencySeconds / (60 / options.bpm)
  return Math.max(0, Number((options.rawStartBeat - latencyBeats).toFixed(4)))
}
