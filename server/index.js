import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  PORT, TMP_ROOT, MAX_DURATION_SEC, MAX_FILE_BYTES, JOB_TTL_MS,
  RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, FFMPEG_DIR,
} from './lib/config.js';
import { normalizeUrl, isSafeUrl, MAX_URL_LENGTH } from './lib/validator.js';
import { fetchInfo, formatDuration, bestThumbnail, runYtDlp } from './lib/ytdlp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ensure temp root
fs.mkdirSync(TMP_ROOT, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
app.use(cors({ origin: true, credentials: false }));

const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// --- Job store ---
const jobs = new Map(); // id -> job
function newJob(url, format, quality) {
  const id = crypto.randomUUID();
  const dir = path.join(TMP_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = {
    id,
    url,
    format,
    quality,
    dir,
    status: 'queued', // queued|analyzing|downloading|processing|ready|error|cancelled
    progress: 0,
    message: 'Queued',
    filePath: null,
    fileName: null,
    error: null,
    createdAt: Date.now(),
    controller: new AbortController(),
    sseClients: new Set(),
  };
  jobs.set(id, job);
  return job;
}

function broadcast(job, payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of job.sseClients) {
    try { res.write(data); } catch {}
  }
}

function updateJob(job, patch) {
  Object.assign(job, patch);
  broadcast(job, {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    ready: job.status === 'ready',
    fileName: job.fileName,
  });
}

// cleanup old jobs
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      try { job.controller.abort(); } catch {}
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch {}
      jobs.delete(id);
    }
  }
}, 60 * 1000);

function ffmpegArgs() {
  const args = [];
  if (FFMPEG_DIR) args.push('--ffmpeg-location', FFMPEG_DIR);
  return args;
}

function deriveFormats(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const videoFormats = formats.filter((f) => f.vcodec && f.vcodec !== 'none');
  const audioFormats = formats.filter((f) => f.acodec && f.acodec !== 'none');
  const maxH = videoFormats.reduce((m, f) => Math.max(m, f.height || 0), 0);
  const tiers = [360, 480, 720, 1080, 1440, 2160, 4320].filter((t) => t <= Math.max(maxH, 360));
  // dedupe consecutive
  const uniqueTiers = [...new Set(tiers)].sort((a, b) => a - b);

  const mp4 = uniqueTiers.map((h) => {
    // estimate size: best video <= h + best audio
    let vSize = 0, aSize = 0;
    const vs = videoFormats.filter((f) => (f.height || 0) <= h && (f.ext === 'mp4' || true));
    if (vs.length) {
      const pick = vs.reduce((best, f) => {
        const bs = (best.filesize || best.filesize_approx || 0);
        const fs_ = (f.filesize || f.filesize_approx || 0);
        return fs_ > bs ? f : best;
      }, vs[0]);
      vSize = pick.filesize || pick.filesize_approx || 0;
    }
    if (audioFormats.length) {
      const pick = audioFormats.reduce((best, f) => {
        const bs = (best.filesize || best.filesize_approx || 0);
        const fs_ = (f.filesize || f.filesize_approx || 0);
        return fs_ > bs ? f : best;
      }, audioFormats[0]);
      aSize = pick.filesize || pick.filesize_approx || 0;
    }
    const size = vSize + aSize;
    return { type: 'mp4', quality: `${h}p`, label: `${h}p`, height: h, filesize: size || null };
  });

  // ensure at least one mp4 option
  if (mp4.length === 0) {
    mp4.push({ type: 'mp4', quality: 'best', label: 'Best (Original)', height: null, filesize: null });
  }
  // Add an explicit "Best / Original" option that selects the highest available quality
  // (including 4K/8K when present) without a height cap.
  let bestSize = 0;
  if (videoFormats.length) {
    const v = videoFormats.reduce((b, f) => ((f.filesize || f.filesize_approx || 0) > (b.filesize || b.filesize_approx || 0) ? f : b), videoFormats[0]);
    bestSize += v.filesize || v.filesize_approx || 0;
  }
  if (audioFormats.length) {
    const a = audioFormats.reduce((b, f) => ((f.filesize || f.filesize_approx || 0) > (b.filesize || b.filesize_approx || 0) ? f : b), audioFormats[0]);
    bestSize += a.filesize || a.filesize_approx || 0;
  }
  if (!mp4.some((o) => o.quality === 'best')) {
    mp4.push({ type: 'mp4', quality: 'best', label: 'Best (Original)', height: null, filesize: bestSize || null });
  } else {
    // update label of existing best entry
    const e = mp4.find((o) => o.quality === 'best');
    if (e) { e.label = 'Best (Original)'; e.filesize = bestSize || e.filesize; }
  }

  // mp3 qualities
  const duration = info.duration || 0;
  const mp3Opts = [
    { kbps: 320, label: '320 kbps (High)' },
    { kbps: 192, label: '192 kbps (Standard)' },
    { kbps: 128, label: '128 kbps (Small)' },
  ];
  const mp3 = mp3Opts.map(({ kbps, label }) => {
    const size = duration ? Math.round((kbps * 1000 / 8) * duration) : null;
    return { type: 'mp3', quality: String(kbps), label, kbps, filesize: size };
  });

  return { mp4, mp3 };
}

function sanitizeFileName(name) {
  return (name || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

// --- Routes ---

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ffmpeg: FFMPEG_DIR !== null });
});

app.post('/api/analyze', async (req, res) => {
  const raw = req.body?.url;
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  const url = normalizeUrl(raw);
  if (!url) return res.status(400).json({ error: 'Invalid URL format' });
  const safe = await isSafeUrl(url);
  if (!safe) return res.status(400).json({ error: 'URL not allowed' });

  try {
    const info = await fetchInfo(url);
    if (!info) throw new Error('No info');
    if (info.is_live) {
      return res.status(400).json({ error: 'Live streams are not supported' });
    }
    const duration = info.duration || 0;
    if (duration && duration > MAX_DURATION_SEC) {
      return res.status(400).json({ error: `Video too long (max ${Math.round(MAX_DURATION_SEC / 60)} min)` });
    }
    const { mp4, mp3 } = deriveFormats(info);
    res.json({
      url,
      title: info.title || 'Untitled',
      thumbnail: bestThumbnail(info),
      duration: duration,
      durationText: formatDuration(duration),
      uploader: info.uploader || info.channel || null,
      platform: info.extractor_key || info.extractor || null,
      webpageUrl: info.webpage_url || url,
      formats: { mp4, mp3 },
    });
  } catch (e) {
    const msg = String(e.message || e);
    res.status(400).json({ error: friendlyError(msg) });
  }
});

function friendlyError(msg) {
  const m = msg.toLowerCase();
  if (m.includes('private') || m.includes('login') || m.includes('sign in')) return 'This video is private or requires login. Only public content you have permission to download is supported.';
  if (m.includes('drm') || m.includes('protected')) return 'This content is DRM-protected and cannot be downloaded.';
  if (m.includes('unsupported url') || m.includes('no suitable')) return 'This URL or platform is not supported.';
  if (m.includes('geo') || m.includes('not available in your country')) return 'This video is not available in the server region.';
  if (m.includes('http error 403') || m.includes('forbidden')) return 'Access denied by the platform. Downloading may be blocked.';
  if (m.includes('404') || m.includes('not found')) return 'Video not found. Check the URL.';
  return msg.slice(0, 300);
}

app.post('/api/convert', async (req, res) => {
  const { url: rawUrl, format, quality } = req.body || {};
  if (typeof rawUrl !== 'string') return res.status(400).json({ error: 'Invalid URL' });
  if (format !== 'mp3' && format !== 'mp4') return res.status(400).json({ error: 'Invalid format' });
  const url = normalizeUrl(rawUrl);
  if (!url) return res.status(400).json({ error: 'Invalid URL' });
  const safe = await isSafeUrl(url);
  if (!safe) return res.status(400).json({ error: 'URL not allowed' });

  const job = newJob(url, format, quality);
  // start processing in background
  processJob(job).catch((e) => {
    job.status = 'error';
    job.error = friendlyError(String(e.message || e));
    job.message = job.error;
    updateJob(job, {});
  });
  res.json({ jobId: job.id });
});

async function processJob(job) {
  const { url, format, quality, dir, controller } = job;
  const signal = controller.signal;
  updateJob(job, { status: 'analyzing', progress: 2, message: 'Analyzing link...' });

  // fetch info for title/filename
  let info;
  try {
    info = await fetchInfo(url);
  } catch (e) {
    throw new Error(friendlyError(String(e.message || e)));
  }
  if (info.is_live) throw new Error('Live streams are not supported');
  const duration = info.duration || 0;
  if (duration && duration > MAX_DURATION_SEC) throw new Error(`Video too long (max ${Math.round(MAX_DURATION_SEC / 60)} min)`);

  const title = sanitizeFileName(info.title || 'video');
  const baseName = `${title}_${quality}`;

  const outTemplate = path.join(dir, `${baseName}.%(ext)s`);

  updateJob(job, { status: 'downloading', progress: 5, message: 'Starting download...' });

  const args = [...ffmpegArgs(), '--no-playlist', '--no-warnings', '--newline', '-o', outTemplate];

  if (format === 'mp3') {
    const kbps = String(quality || '192').replace(/[^0-9]/g, '') || '192';
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', `${kbps}K`);
  } else {
    const q = String(quality || '720p');
    const h = q.endsWith('p') ? q.slice(0, -1) : q;
    if (q === 'best') {
      args.push('-f', 'bestvideo+bestaudio/best');
    } else {
      const height = parseInt(h, 10);
      // Prefer H.264 video + AAC audio so the resulting MP4 plays everywhere
      // (Windows Media Player, QuickTime, mobile players) without extra codecs.
      // No codec preference here: we transcode to H.264/AAC afterwards anyway, so just
      // grab the highest resolution up to the requested cap (any codec).
      const prefer = height
        ? `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`
        : 'bestvideo+bestaudio/best';
      if (isNaN(height)) {
        args.push('-f', 'bestvideo+bestaudio/best');
      } else {
        args.push('-f', prefer);
      }
    }
    args.push('--merge-output-format', 'mp4');
  }

  // progress tracking
  let lastPercent = 5;
  const onProgress = ({ percent, raw }) => {
    if (percent != null) {
      const p = Math.min(95, Math.max(lastPercent, Math.round(percent)));
      lastPercent = p;
      updateJob(job, { progress: p, message: raw || (format === 'mp3' ? 'Downloading audio...' : 'Downloading video...') });
    } else if (raw) {
      updateJob(job, { message: raw });
    }
  };

  args.push(url);

  await runYtDlp(args, { onProgress, signal });

  // find output file
  const files = fs.readdirSync(dir);
  if (files.length === 0) throw new Error('No output file produced');
  // pick the largest file (the final media)
  let chosen = files[0];
  let chosenSize = 0;
  for (const f of files) {
    const st = fs.statSync(path.join(dir, f));
    if (st.size > chosenSize) { chosenSize = st.size; chosen = f; }
  }
  if (chosenSize === 0) throw new Error('Empty output file');
  if (chosenSize > MAX_FILE_BYTES) throw new Error('Output file too large');

  const ext = path.extname(chosen).toLowerCase();
  const expectedExt = format === 'mp3' ? '.mp3' : '.mp4';
  // rename to expected ext if needed
  let finalPath = path.join(dir, chosen);
  if (ext !== expectedExt) {
    const newPath = path.join(dir, baseName + expectedExt);
    fs.renameSync(finalPath, newPath);
    finalPath = newPath;
    chosen = path.basename(newPath);
  }

  // Ensure MP4 plays in common players (Windows Media Player, QuickTime, mobile)
  // by transcoding to H.264 + AAC when the downloaded streams aren't already compatible.
  if (format === 'mp4') {
    const compat = await ensureCompatibleMp4(finalPath, dir, baseName, duration, (p, msg) => {
      updateJob(job, { progress: p, message: msg });
    }, signal);
    if (compat && compat !== finalPath) {
      try { fs.rmSync(finalPath, { force: true }); } catch {}
      finalPath = compat;
      chosen = path.basename(compat);
    }
  }

  job.filePath = finalPath;
  job.fileName = chosen;
  updateJob(job, { status: 'ready', progress: 100, message: 'Ready to download' });
}

function ffmpegBin() {
  if (FFMPEG_DIR) return path.join(FFMPEG_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  return 'ffmpeg';
}
function ffprobeBin() {
  if (FFMPEG_DIR) return path.join(FFMPEG_DIR, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  return 'ffprobe';
}

async function probeCodecs(filePath) {
  return new Promise((resolve) => {
    const proc = spawn(ffprobeBin(), [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => resolve(out.trim().toLowerCase()));
    proc.on('error', () => resolve(''));
  });
}

async function probeAudioCodec(filePath) {
  return new Promise((resolve) => {
    const proc = spawn(ffprobeBin(), [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => resolve(out.trim().toLowerCase()));
    proc.on('error', () => resolve(''));
  });
}

async function ensureCompatibleMp4(inputPath, dir, baseName, duration, onProgress, signal) {
  let vcodec = '';
  let acodec = '';
  try { vcodec = await probeCodecs(inputPath); } catch {}
  try { acodec = await probeAudioCodec(inputPath); } catch {}
  const needTranscode = !(vcodec === 'h264' && (acodec === 'aac' || acodec === ''));
  if (!needTranscode) return inputPath;

  onProgress?.(96, 'Optimizing for playback (converting to H.264/AAC)...');
  const outPath = path.join(dir, baseName + '_compat.mp4');
  const dur = duration || 0;
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin(), [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-threads', '0',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let killed = false;
    const onAbort = () => { killed = true; try { proc.kill('SIGTERM'); } catch {} };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    let stderr = '';
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      const m = s.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
      if (m && dur > 0 && onProgress) {
        const sec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
        const pct = Math.min(99, 96 + Math.round((sec / dur) * 3));
        onProgress(pct, 'Optimizing for playback...');
      }
    });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (killed) return reject(new Error('Cancelled'));
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) resolve(outPath);
      else reject(new Error((stderr || 'FFmpeg transcode failed').slice(-1500)));
    });
  });
}

app.get('/api/jobs/:id/progress', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  job.sseClients.add(res);
  // send current state
  res.write(`data: ${JSON.stringify({
    id: job.id, status: job.status, progress: job.progress, message: job.message,
    error: job.error, ready: job.status === 'ready', fileName: job.fileName,
  })}\n\n`);
  req.on('close', () => { job.sseClients.delete(res); });
});

app.get('/api/jobs/:id/file', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'ready' || !job.filePath) {
    return res.status(404).json({ error: 'File not ready' });
  }
  const stat = fs.statSync(job.filePath);
  res.setHeader('Content-Type', job.format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(job.fileName)}"`);
  res.setHeader('Content-Length', stat.size);
  const stream = fs.createReadStream(job.filePath);
  stream.pipe(res);
  stream.on('close', () => {
    // cleanup after download
    setTimeout(() => {
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch {}
      jobs.delete(job.id);
    }, 5000);
  });
  stream.on('error', () => { res.end(); });
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  try { job.controller.abort(); } catch {}
  try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch {}
  jobs.delete(job.id);
  res.json({ ok: true });
});

// Serve frontend in production
const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => {
    if (fs.existsSync(path.join(distDir, 'index.html'))) res.sendFile(path.join(distDir, 'index.html'));
    else res.status(404).send('Not found');
  });
}

app.listen(PORT, () => {
  console.log(`Video downloader server running on http://localhost:${PORT}`);
  console.log(`ffmpeg: ${FFMPEG_DIR || '(PATH)'}`);
});