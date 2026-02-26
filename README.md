# Voice Notes Assistant

Voice Notes Assistant is an Obsidian plugin for recording, transcription, and AI summaries in lecture and meeting workflows.

## Plugin Metadata

- Plugin ID: `lecture-recorder`
- Name: `Voice Notes Assistant`
- Current version: `0.1.1`
- Min Obsidian version: `1.0.0`
- Desktop only: `true`

## Features

- Inline audio block (`lecture-audio`) with start/pause/resume/stop controls
- Playback UI with seek, speed control, and waveform
- Transcription providers:
  - OpenAI Whisper-compatible APIs
  - iFLYTEK RAASR
  - Local `whisper.cpp` (offline)
- Summary providers:
  - OpenAI-compatible chat-completion APIs
  - Claude API (Anthropic)
- Sidecar cache files:
  - `*.transcript.json`
  - `*.summary.md`
- UI language switching: Chinese / English

## Privacy and External Services

- Local recording files and cache files are stored in your vault by default.
- Cloud requests are sent only when you run transcription/summary with a cloud provider.
- Cloud providers used by this plugin:
  - Whisper-compatible transcription endpoint (`/audio/transcriptions`)
  - iFLYTEK RAASR API (`https://raasr.xfyun.cn/v2/api`)
  - OpenAI-compatible chat-completion endpoint (`/chat/completions`)
  - Claude Messages API (`https://api.anthropic.com/v1/messages`)
- API keys are stored in plugin settings data (`.obsidian/plugins/lecture-recorder/data.json`).
- If you choose local `whisper.cpp`, transcription runs offline on your machine.

## Development Install

1. Place this repo in your vault plugins directory (folder name should be `lecture-recorder` for real installation).
2. Install dependencies and build:

```bash
npm install
npm run build
```

3. In Obsidian: `Settings -> Community Plugins -> Reload plugins`, then enable `Voice Notes Assistant`.

## Version Management

- Bump version (updates `manifest.json`, `package.json`, `versions.json` together):

```bash
npm run version:bump -- 0.1.2
```

- Bump version and change compatibility floor:

```bash
npm run version:bump -- 0.2.0 1.6.0
```

- Release validation (build + consistency checks):

```bash
npm run release:check
```

## Obsidian Community Plugin Submission

### Required repository files

- `README.md`
- `LICENSE`
- `manifest.json`
- `versions.json`

### Release assets (GitHub Release)

Each release tag must upload:

- `manifest.json`
- `main.js`
- `styles.css` (if exists)

### Submission steps

1. Prepare release files:

```bash
npm run release:check
```

2. Commit and tag:

```bash
git add .
git commit -m "chore: prepare 0.1.1 for Obsidian review"
git tag 0.1.1
git push origin main --tags
```

3. Create a GitHub Release for tag `0.1.1` and upload:
   - `manifest.json`
   - `main.js`
   - `styles.css`

4. Submit to `obsidianmd/obsidian-releases`:
   - Edit `community-plugins.json`
   - Add one line:

```json
"https://github.com/chenqiyukkk/Voice-Notes-Assistant"
```

5. Open PR and wait for review feedback.

## License

MIT
