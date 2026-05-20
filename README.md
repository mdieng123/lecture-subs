# LectureSubs

Desktop app for transcribing and translating Arabic Islamic lectures into English subtitles. Paste a YouTube link or drop a video file, and it generates synced subtitles using Groq Whisper (transcription) + Gemini (translation with Salafi scholarly accuracy). Export as SRT, hard-burned MP4, auto-cut vertical clips, or split long lectures into YouTube-ready 16:9 segments.

## Requirements

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **A Gemini API key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free tier works)
- **A Groq API key** — [console.groq.com/keys](https://console.groq.com/keys) (free tier works)

## Setup

```bash
# 1. Clone
git clone <your-repo-url>
cd lecture-subs

# 2. Install dependencies
#    This also auto-downloads the yt-dlp binary for your platform
npm install

# 3. Run in dev mode
npm run dev
```

On first launch, open **Settings** (gear icon, top right) and enter your Gemini and Groq API keys. They are stored securely in your OS keychain — never written to disk.

## How to use

### From a YouTube video
1. On the Import screen, click the **YouTube URL** tab
2. Paste a YouTube link and click **Download**
3. Previously downloaded videos appear below — click one to reuse it without re-downloading
4. Once a video is loaded, click **Transcribe & Translate**

### From a local video file
1. Drag and drop a video file onto the Import screen, or click to browse
2. Supported formats: MP4, MOV, MKV, WebM, AVI
3. Click **Transcribe & Translate**

### Editing subtitles
- Click any subtitle cue to edit the English or Arabic text
- Click the timestamp (e.g. `00:12 → 00:18`) to seek the video preview to that cue; click **✎** next to it to edit the timing
- **Merge** combines a cue with the one below it
- **Undo/Redo** available in the toolbar

### Exporting
Click **Export** in the top-right corner:
- **SRT file** — subtitle file only, attach to any video player
- **Soft subtitles (MP4)** — video with embedded subtitle track, toggleable in players
- **Hard subtitles (MP4)** — subtitles burned into the video, visible everywhere

### Intelligent Clips
Click **Clips** in the editor toolbar to auto-detect the most clip-worthy moments from the lecture. Each clip gets a 9:16 preview with subtitle overlay — select the ones you want and export them all at once to a folder.

### YouTube Segments (lectures 25 min+)
Click **YouTube Videos** in the editor toolbar to split a long lecture into 4–20 minute YouTube-ready segments. Gemini analyzes the transcript and finds natural topic boundaries. Each segment gets a 16:9 preview, editable cues with Arabic and English text, and click-to-seek navigation. Save as `.lecturesegments` and reopen later, or export all selected segments to a folder at once.

> **Groq quota:** Transcription uses a 7200 sec/hour rolling Groq limit. If the quota is exhausted, a red banner with a countdown appears across all screens — wait for it to clear before re-processing. Quitting the app does **not** reset the timer.

## Logo watermark

Upload a logo in **Settings → Logo Watermark**. Position, size, and opacity are controlled from the toolbar in the editor. The logo appears in all exports and clip previews.

## Saving and reopening projects

Click **Save** at any point to save a `.lecturesubs` project file. Reopen it by dragging it onto the Import screen or using the browse button. If the original video has moved, the app will prompt you to locate it.

## Settings

| Setting | Description |
|---|---|
| Gemini API Key | Used for Arabic → English translation |
| Groq API Key | Used for Arabic speech-to-text with word-level timestamps |
| Model | `gemini-2.5-pro` (higher quality) or `gemini-2.5-flash` (faster, ~10× cheaper) |
| Chunk length | How many minutes of audio are sent per API call (5–30 min) |
| Max concurrent chunks | How many chunks are processed in parallel (more = faster but uses more API quota) |
| YouTube Downloads | Shows disk usage of downloaded videos with a clear button |

## Security & Privacy

**Keychain prompt (macOS):** When you save an API key in Settings, macOS will ask LectureSubs to access the Keychain. This is expected and intentional — the app uses Electron's `safeStorage` API to encrypt your keys with a system-managed key before writing them to disk. Your keys are never stored in plain text.

**What leaves your device:**
| Data | Destination | Why |
|---|---|---|
| Audio chunks (no video) | Groq API | Speech-to-text transcription |
| Arabic + English transcript text | Google Gemini API | Translation |
| YouTube URL | yt-dlp → YouTube servers | Video download |

**What stays local:** Video files, project files (`.lecturesubs`), exports, and subtitles never leave your device. No analytics, no telemetry, no account required.

**API keys** are encrypted on disk using your OS keychain and only sent to their respective services (Groq / Google). They are never shared with any third party.

## Development

```bash
npm run dev          # Dev server (hot reload)
npm run typecheck    # TypeScript check (frontend + electron)
npm run build        # Production build
npm run dist         # Build + package as distributable
```

## Stack

- **Electron** — desktop shell
- **React + TypeScript + Vite** — frontend
- **Tailwind CSS** — styling
- **Groq Whisper** (`whisper-large-v3`) — Arabic speech-to-text with word timestamps
- **Google Gemini** — Arabic → English translation
- **fluent-ffmpeg + ffmpeg-static** — audio extraction, silence detection, video export
- **yt-dlp** — YouTube video download
- **Zustand** — state management
