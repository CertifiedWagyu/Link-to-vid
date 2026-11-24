# VideoGrab — Online Video & Audio Downloader

A modern full-stack app that converts public video links into downloadable MP3 or MP4 files.

## Stack
- Frontend: React 19 + Vite + Tailwind CSS 4 + TypeScript
- Backend: Node.js (Express) + yt-dlp + FFmpeg

## Prerequisites
- Node.js 20+
- Python 3.9+ with `yt-dlp` (`pip install yt-dlp`)
- FFmpeg on PATH (or set `FFMPEG_PATH`)

## Setup
```bash
npm install
cp .env.example .env   # edit if needed
```

## Development
Run backend and frontend in two terminals:
```bash
npm run dev:server   # http://localhost:8787
npm run dev:client   # http://localhost:5173 (proxies /api)
```
Or both together:
```bash
npm run dev
```

## Production
```bash
npm run build
npm start            # serves dist + API on PORT
```

## Environment variables
See `.env.example`.

## Notes
- Only public content you have permission to download is supported.
- Private, DRM-protected, or login-required videos are not supported.
- Temporary files are deleted after download and after a TTL.
- "Best (Original)" quality is gated behind a rewarded ad (one ad per download). The current implementation uses a client-side countdown placeholder; to use real ads, replace the modal in `src/App.tsx` with your ad network's rewarded-ad SDK (e.g., Google AdSense/AdMob rewarded, or a provider like Monumetric/PropellerAds) and call `startConversion()` only after the SDK reports the ad completed.
- Do not deploy the frontend alone to a static host without the backend; the API must run on a server with yt-dlp and FFmpeg installed.
