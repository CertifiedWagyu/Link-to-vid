import { spawn } from 'node:child_process';
import { YTDLP_CMD, YTDLP_PREFIX, FFMPEG_DIR } from './config.js';

export const YTDLP_CMD_RUN = YTDLP_CMD;
export const YTDLP_PREFIX_RUN = YTDLP_PREFIX;
export const FFMPEG_DIR_RUN = FFMPEG_DIR;

export function runYtDlp(args, { onProgress, onStdout, signal } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_CMD_RUN, [...YTDLP_PREFIX_RUN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const onAbort = () => {
      killed = true;
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000);
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    proc.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (onStdout) onStdout(s);
    });
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      // progress lines
      if (onProgress) {
        const lines = s.split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/\[download\]\s+(\d+\.?\d*)%/);
          if (m) onProgress({ percent: parseFloat(m[1]), raw: line.trim() });
          const m2 = line.match(/\[ExtractAudio\]/);
          if (m2) onProgress({ percent: null, raw: 'Converting audio...' });
          const m3 = line.match(/\[Merger\]/);
          if (m3) onProgress({ percent: null, raw: 'Merging streams...' });
          const m4 = line.match(/\[ffmpeg\]/);
          if (m4) onProgress({ percent: null, raw: 'Processing with FFmpeg...' });
        }
      }
    });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (killed) return reject(new Error('Cancelled'));
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `yt-dlp exited ${code}`).slice(-2000)));
    });
  });
}

export async function fetchInfo(url) {
  const cookieArgs = [];
  const p = process.env.COOKIES_FILE;
  if (p) cookieArgs.push('--cookies', p);
  const { stdout } = await runYtDlp(['--dump-single-json', '--no-playlist', '--no-warnings', ...cookieArgs, url]);
  let data;
  try { data = JSON.parse(stdout); } catch (e) { throw new Error('Could not parse video info'); }
  return data;
}

export function formatDuration(sec) {
  if (!sec || !isFinite(sec)) return null;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function bestThumbnail(info) {
  if (info.thumbnail) return info.thumbnail;
  if (Array.isArray(info.thumbnails) && info.thumbnails.length) {
    const t = info.thumbnails[info.thumbnails.length - 1];
    return t?.url || null;
  }
  return null;
}