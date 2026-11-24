import { resolveFfmpeg, resolveYtDlp } from './paths.js';

const ytdlp = resolveYtDlp();
if (!ytdlp) {
  console.error('yt-dlp not found. Install with: pip install yt-dlp');
  process.exit(1);
}
const ffmpegDir = resolveFfmpeg();
if (ffmpegDir === null) {
  console.warn('ffmpeg not found in PATH; audio conversion may fail.');
}

export const YTDLP_CMD = ytdlp.cmd;
export const YTDLP_PREFIX = ytdlp.prefix;
export const FFMPEG_DIR = ffmpegDir;

export const PORT = Number(process.env.PORT || 8787);
export const TMP_ROOT = process.env.TMP_ROOT || (process.platform === 'win32' ? 'C:\\Temps\\opencode\\vd-tmp' : '/tmp/vd-tmp');
export const MAX_DURATION_SEC = Number(process.env.MAX_DURATION_SEC || 3600); // 1 hour
export const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 4 * 1024 * 1024 * 1024); // 4GB
export const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 10 * 60 * 1000); // 10 min
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX = 20;