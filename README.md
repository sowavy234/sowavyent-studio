# SoWavyEnt Studio

SoWavyEnt Studio is a browser-first DAW prototype that combines a multitrack arranger, Web Audio playback, mixer controls, AI-assisted mix review, reference-style mastering controls, collaboration status, song import into a fresh vocal session, live mic monitoring, real-time auto-tune, and session export.

## Architecture

- `src/App.tsx`: studio state orchestration, transport actions, audio import, export, AI mix simulation, mastering simulation.
- `src/data/studioData.ts`: typed seed project, track, clip, mastering, library, and collaborator data.
- `src/lib/audioEngine.ts`: local Web Audio engine for scheduled oscillator, drum, metronome, and decoded imported-audio playback.
- `src/lib/liveVocalChain.ts`: low-latency microphone graph, AudioWorklet routing, AudioParam control automation, optional SharedArrayBuffer scale sync, corrected monitor path, processed take capture, and stream health handling.
- `src/lib/latencyCalibration.ts`: browser-safe latency baseline validation, fallback hardware delta, and automatic recording-offset compensation.
- `public/worklets/autoTuneProcessor.js`: fast autocorrelation pitch tracking, scale snapping, correction telemetry, and worklet-side pitch shifting.
- `src/components/TransportBar.tsx`: transport, BPM, key, loop, metronome, import, export.
- `src/components/LibraryPanel.tsx`: track creation, loop packs, plugin rack, import trigger.
- `src/components/Arrangement.tsx`: timeline ruler, track headers, clips, waveform display, playhead.
- `src/components/InspectorPanel.tsx`: AI mix, mastering, collaboration, and clip detail workflows.
- `src/components/MicPanel.tsx`: FIFINE K688-focused browser input selection, metering, monitoring, and take recording.
- `src/components/Mixer.tsx`: channel strips, inserts, meters, faders, sends, master bus.
- `src/components/CollaborationStrip.tsx`: live-room and session-security indicators.

## Song Import Workflow

- Click `Import` in the transport bar or library panel and choose your backing song.
- SoWavyEnt Studio opens a **new project** with the song on an `Imported Song` track and an empty armed `Lead Vocal` track.
- Transport length, loop region, and project title are rebuilt from the imported file.
- Live vocal monitor and auto-tune are enabled automatically; arm the mic and sing over the track.

## FIFINE K688 Mic Workflow

- Use the `Mic` inspector tab and click `Arm K688`.
- In USB mode, the K688 should appear in the browser input list as a FIFINE or K688 audio input after microphone permission is granted.
- In XLR mode, the browser will not see the K688 directly. It will see the USB audio interface or mixer that the XLR cable is plugged into.
- SoWavyEnt Studio requests music-safe browser capture settings: echo cancellation off, noise suppression off, auto gain off, mono preferred, and 48 kHz preferred.
- `Monitor through headphones` routes your live vocal through the browser with low-latency monitoring.
- `Live auto-tune` uses a browser `AudioWorklet` to detect pitch, snap to the project key, apply real-time correction while you sing, and report live pitch/target/correction telemetry back to the UI.
- Retune speed, strength, humanize, and bypass are controlled through `AudioParam` automation inside the worklet. Key/scale constraints use a SharedArrayBuffer when cross-origin isolation is available and a low-frequency message fallback otherwise.
- AI Mix and Analyze read the live analyzer/worklet telemetry matrix: f0, spectral centroid, pitch lock, worklet analysis cost, stream mute state, and exact cents of tune correction.
- Use `Ping test` to set the browser-safe AudioContext latency baseline. Recorded takes are placed with automatic delay compensation so vocals line up closer to the backing track.
- `Record K688 take` captures the processed vocal stream when the live chain is armed. Press it again to stop; the decoded take is dropped onto the armed vocal track.
- Browser code cannot read or control the K688 hardware mute state. If the meter stays flat, check the mic mute button, gain knob, OS input permission, and selected input device.
- Browser apps cannot force a guaranteed 64/128-frame hardware buffer or raw 24-bit capture across all devices. Use HTTPS, Chrome/Edge, wired headphones, and the K688 USB path or a low-latency USB interface for the best real-time monitoring behavior.

## Security Model

- Audio decoding and playback stay local in the browser through Web Audio.
- K688 input capture stays local in the browser through `getUserMedia` and `MediaRecorder`.
- No API keys, auth tokens, or secrets are embedded in the frontend.
- Imported audio files are decoded in memory and are not uploaded by this prototype.
- Session export removes `AudioBuffer` objects and writes metadata as JSON.
- A production deployment should add authentication, authorization, encrypted project storage, CSRF protection for state-changing APIs, upload scanning, strict content-security policy, rate limits, audit logging, and signed media URLs.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

## Deployment

Build static assets with `npm run build` and deploy `dist/` behind HTTPS. For production collaboration and cloud project storage, add a backend with per-project ACLs, short-lived upload URLs, and server-side validation of file type, file size, and ownership.
