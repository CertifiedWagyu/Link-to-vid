import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const KNOWN_FFMPEG_DIR = 'C:\\Users\\delma\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.1-full_build\\bin';

export function resolveFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, 'ffmpeg', KNOWN_FFMPEG_DIR + '\\ffmpeg.exe'];
  for (const c of candidates) {
    if (!c) continue;
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore', timeout: 5000 });
      const dir = c.includes('\\') || c.includes('/') ? c.replace(/[\\/][^\\/]+$/, '') : '';
      return dir;
    } catch {}
  }
  if (fs.existsSync(KNOWN_FFMPEG_DIR + '\\ffmpeg.exe')) return KNOWN_FFMPEG_DIR;
  return null;
}

export function resolveYtDlp() {
  const candidates = [process.env.YTDLP_PATH, 'yt-dlp', 'C:\\Users\\delma\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\yt-dlp.exe'];
  for (const c of candidates) {
    if (!c) continue;
    try { execFileSync(c, ['--version'], { stdio: 'ignore', timeout: 10000 }); return { cmd: c, prefix: [] }; } catch {}
  }
  try { execFileSync('python', ['-m', 'yt_dlp', '--version'], { stdio: 'ignore', timeout: 10000 }); return { cmd: 'python', prefix: ['-m', 'yt_dlp'] }; } catch {}
  try { execFileSync('py', ['-m', 'yt_dlp', '--version'], { stdio: 'ignore', timeout: 10000 }); return { cmd: 'py', prefix: ['-m', 'yt_dlp'] }; } catch {}
  return null;
}