import { useCallback, useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

// Replace the contents of this component with your real ad network's code
// (e.g., an AdSense <ins class="adsbygoogle"> block) to earn revenue.
function AdSlot({ label }: { label: string }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-xs text-slate-500">
        Ad slot: {label} — replace with your ad network code to monetize
      </div>
    </div>
  );
}

type FormatOption = { type: string; quality: string; label: string; filesize?: number | null };
type Info = {
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number;
  durationText: string | null;
  uploader: string | null;
  platform: string | null;
  formats: { mp4: FormatOption[]; mp3: FormatOption[] };
};

type Status = 'idle' | 'analyzing' | 'ready' | 'converting' | 'done' | 'error';

function fmtBytes(b: number | null | undefined): string {
  if (!b) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

const PLATFORMS = [
  { name: 'YouTube', color: 'bg-[#FF0000]', letter: 'Y' },
  { name: 'TikTok', color: 'bg-black', letter: 'T' },
  { name: 'Instagram', color: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]', letter: 'I' },
  { name: 'Facebook', color: 'bg-[#1877F2]', letter: 'f' },
  { name: 'Twitter / X', color: 'bg-black', letter: 'X' },
  { name: 'Vimeo', color: 'bg-[#1AB7EA]', letter: 'v' },
];

function PlatformLogo({ name }: { name: string }) {
  const cls = 'w-7 h-7 text-white';
  switch (name) {
    case 'YouTube':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );
    case 'TikTok':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.57-4.96 1.66-1.44 3.93-2.13 6.11-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.09 1.07-1.25 1.8-.17.7-.06 1.44.29 2.08.44.8 1.27 1.36 2.17 1.47.76.1 1.53-.09 2.16-.52.59-.4.98-1.03 1.12-1.73.1-.49.08-.99.08-1.49.01-3.68 0-7.36 0-11.04.01-.07.01-.14 0-.2z" />
        </svg>
      );
    case 'Instagram':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );
    case 'Facebook':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'Twitter / X':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case 'Vimeo':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23.977 7.603c-.11 2.48-1.84 5.88-5.19 10.2-3.46 4.5-6.38 6.75-8.77 6.75-1.48 0-2.73-1.37-3.75-4.1L4.6 14.25c-.76-2.73-1.57-4.1-2.44-4.1-.19 0-.85.4-1.98 1.19L0 10.97c1.24-1.09 2.46-2.18 3.66-3.27 1.64-1.42 2.87-2.17 3.69-2.24 1.94-.19 3.14 1.14 3.6 3.98.49 3.06.83 4.97 1.02 5.73.57 2.6 1.2 3.9 1.88 3.9.54 0 1.35-.85 2.43-2.55 1.08-1.7 1.66-3 1.74-3.9.16-1.5-.43-2.25-1.77-2.25-.63 0-1.28.14-1.95.42 1.3-4.25 3.79-6.32 7.47-6.21 2.73.08 4.02 1.83 3.87 5.25z" />
        </svg>
      );
    default:
      return <span className="text-white font-bold">{name.charAt(0)}</span>;
  }
}

export default function App() {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [format, setFormat] = useState<'mp3' | 'mp4'>('mp4');
  const [quality, setQuality] = useState<string>('720p');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(10);
  const [adComplete, setAdComplete] = useState(false);

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setStatus('analyzing');
    setError('');
    setInfo(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setInfo(data as Info);
      setFormat('mp4');
      setQuality((data as Info).formats.mp4[0]?.quality ?? '720p');
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setStatus('error');
    }
  }, [url]);

  const handlePaste = useCallback(async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setUrl(t);
    } catch {
      // ignore
    }
  }, []);

  const startConversion = useCallback(async () => {
    if (!info) return;
    setStatus('converting');
    setProgress(0);
    setMessage('Starting...');
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: info.url, format, quality }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Conversion failed');
      const id = data.jobId as string;
      setJobId(id);
      const es = new EventSource(`${API_BASE}/api/jobs/${id}/progress`);
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          setProgress(typeof d.progress === 'number' ? d.progress : 0);
          setMessage(d.message || '');
          if (d.error) {
            setError(d.error);
            setStatus('error');
            es.close();
          }
          if (d.ready) {
            setFileName(d.fileName || null);
            setStatus('done');
            es.close();
          }
        } catch {
          // ignore parse errors
        }
      };
      es.onerror = () => {
        // EventSource will auto-retry; close on terminal states handled above
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed');
      setStatus('error');
    }
  }, [info, format, quality]);

  const handleDownload = useCallback(() => {
    if (!info) return;
    // Rewarded ad gate: "Best (Original)" quality requires watching one ad first.
    if (format === 'mp4' && quality === 'best') {
      setAdCountdown(10);
      setAdComplete(false);
      setShowAd(true);
      return;
    }
    startConversion();
  }, [info, format, quality, startConversion]);

  // Rewarded ad countdown
  useEffect(() => {
    if (!showAd) return;
    setAdCountdown(10);
    setAdComplete(false);
    const interval = setInterval(() => {
      setAdCountdown((c) => {
        if (c <= 1) {
          setAdComplete(true);
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showAd]);

  useEffect(() => {
    if (status === 'done' && jobId) {
      const a = document.createElement('a');
      a.href = `${API_BASE}/api/jobs/${jobId}/file`;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }, [status, jobId, fileName]);

  const handleAnother = useCallback(() => {
    setStatus('idle');
    setInfo(null);
    setUrl('');
    setJobId(null);
    setProgress(0);
    setMessage('');
    setFileName(null);
    setError('');
  }, []);

  const options: FormatOption[] = info ? (format === 'mp3' ? info.formats.mp3 : info.formats.mp4) : [];

  // ensure quality valid when switching format
  useEffect(() => {
    if (!info) return;
    const opts = format === 'mp3' ? info.formats.mp3 : info.formats.mp4;
    if (!opts.some((o) => o.quality === quality)) {
      setQuality(opts[0]?.quality ?? '');
    }
  }, [format, info, quality]);

  return (
    <div className="min-h-screen bg-[#07091a] text-slate-100 selection:bg-violet-500/40">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute top-40 right-0 w-[500px] h-[500px] rounded-full bg-blue-600/15 blur-3xl" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/60 border-b border-white/5">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">VideoGrab</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-slate-300">
            <a href="#platforms" className="hover:text-white transition">Platforms</a>
            <a href="#how" className="hover:text-white transition">How it works</a>
            <a href="#about" className="hover:text-white transition">About</a>
          </div>
          <a href="#converter" className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition">
            Get started
          </a>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Free · No signup · No watermark
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-violet-200 to-blue-300 bg-clip-text text-transparent">
            Convert Videos to MP3 & MP4
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto">
            Paste a link from YouTube, TikTok, Instagram, Facebook and more. We analyze it and let you download in the quality you choose — audio or video.
          </p>
        </section>

        {/* Converter */}
        <section id="converter" className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5 sm:p-7 shadow-2xl shadow-violet-900/20 backdrop-blur">
            {/* URL input */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
                  placeholder="Paste video URL here…"
                  className="w-full bg-slate-900/60 border border-white/10 rounded-2xl px-5 py-4 pr-24 text-base outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition"
                />
                <button
                  onClick={handlePaste}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium transition"
                >
                  Paste
                </button>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={status === 'analyzing' || !url.trim()}
                className="px-7 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold shadow-lg shadow-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {status === 'analyzing' ? 'Analyzing…' : 'Convert'}
              </button>
            </div>

            {/* Error */}
            {status === 'error' && error && (
              <div className="mt-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-200">
                {error}
              </div>
            )}

            {/* Analyzing spinner */}
            {status === 'analyzing' && (
              <div className="mt-6 flex items-center justify-center gap-3 text-slate-400">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span>Analyzing link…</span>
              </div>
            )}

            {/* Ready: preview + options */}
            {status === 'ready' && info && (
              <div className="mt-6 space-y-5">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="sm:w-48 shrink-0">
                    {info.thumbnail ? (
                      <img src={info.thumbnail} alt={info.title} className="w-full aspect-video object-cover rounded-2xl border border-white/10" />
                    ) : (
                      <div className="w-full aspect-video rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-500 text-sm">
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg leading-snug line-clamp-2">{info.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                      {info.durationText && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">⏱ {info.durationText}</span>}
                      {info.uploader && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">👤 {info.uploader}</span>}
                      {info.platform && <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">{info.platform}</span>}
                    </div>
                  </div>
                </div>

                {/* Format toggle */}
                <div className="flex gap-2 p-1 rounded-2xl bg-slate-900/60 border border-white/10 w-fit">
                  {(['mp4', 'mp3'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${format === f ? 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
                    >
                      {f.toUpperCase()} {f === 'mp3' ? '(Audio)' : '(Video)'}
                    </button>
                  ))}
                </div>

                {/* Quality */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Quality</label>
                  <div className="flex flex-wrap gap-2">
                    {options.map((o) => (
                      <button
                        key={o.quality}
                        onClick={() => setQuality(o.quality)}
                        className={`px-4 py-2 rounded-xl text-sm border transition ${quality === o.quality ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                      >
                        {o.label}
                        {o.quality === 'best' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">AD</span>}
                        {o.filesize ? <span className="ml-2 text-xs text-slate-500">~{fmtBytes(o.filesize)}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold shadow-lg shadow-violet-600/30 transition"
                >
                  Download {format.toUpperCase()}
                </button>
              </div>
            )}

            {/* Converting */}
            {status === 'converting' && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{message || 'Processing…'}</span>
                  <span className="text-violet-300 font-semibold">{progress}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-800 overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">Please keep this tab open. Large files may take a while.</p>
              </div>
            )}

            {/* Done */}
            {status === 'done' && (
              <div className="mt-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5 text-center space-y-3">
                <div className="text-emerald-300 font-semibold text-lg">✓ Ready!</div>
                <p className="text-sm text-slate-300">Your file has started downloading.</p>
                {jobId && (
                  <a
                    href={`${API_BASE}/api/jobs/${jobId}/file`}
                    className="inline-block px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-sm font-medium transition"
                  >
                    Download again
                  </a>
                )}
                <div>
                  <button onClick={handleAnother} className="text-sm text-slate-400 hover:text-white underline">
                    Download another video
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-500 mt-4">
            Only download content you own or have permission to use. Respect platform terms and copyright.
          </p>
        </section>

        <AdSlot label="banner" />

        {/* Supported platforms */}
        <section id="platforms" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl font-bold text-center mb-2">Supported Platforms</h2>
          <p className="text-slate-400 text-center mb-8">Works with all major video platforms.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {PLATFORMS.map((p) => (
              <div key={p.name} className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 text-center hover:border-white/20 transition">
                <div className={`mx-auto w-12 h-12 rounded-xl ${p.color} mb-3 flex items-center justify-center shadow-lg`}>
                  <PlatformLogo name={p.name} />
                </div>
                <div className="text-sm font-medium">{p.name}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-6">
            Plus many more supported by yt-dlp. Private, DRM-protected, or login-required content is not supported.
          </p>
        </section>

        {/* How it works */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl font-bold text-center mb-8">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { n: '1', t: 'Paste link', d: 'Copy a video URL and paste it into the box above.' },
              { n: '2', t: 'Choose format', d: 'Pick MP3 or MP4 and select your preferred quality.' },
              { n: '3', t: 'Download', d: 'Click download and save the file to your device.' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl bg-white/[0.04] border border-white/10 p-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center font-bold mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold mb-1">{s.t}</h3>
                <p className="text-sm text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* About */}
        <section id="about" className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-7">
            <h2 className="text-2xl font-bold mb-3">About</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              VideoGrab is a free tool that converts publicly available videos into MP3 or MP4 files. Processing happens
              on our server using FFmpeg and yt-dlp. We do not store your downloads — temporary files are deleted
              automatically after you download them. Please only download content you have the right to use.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div>© {new Date().getFullYear()} VideoGrab. All rights reserved.</div>
          <div className="flex gap-5">
            <a href="#" className="hover:text-slate-300 transition">Privacy Policy</a>
            <a href="#" className="hover:text-slate-300 transition">Terms of Service</a>
            <a href="#about" className="hover:text-slate-300 transition">About</a>
          </div>
        </div>
      </footer>

      {/* Rewarded ad modal for Best (Original) quality */}
      {showAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/10 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase tracking-wider text-slate-400">Advertisement</span>
              <span className="text-xs text-slate-500">
                {adComplete ? 'Ad finished' : `Skip in ${adCountdown}s`}
              </span>
            </div>
            <div className="relative aspect-video rounded-2xl bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-500 overflow-hidden flex items-center justify-center">
              <div className="text-center text-white px-6">
                <div className="text-2xl font-bold mb-2">Your ad here</div>
                <div className="text-sm opacity-80">Support the service — watch to unlock Best quality</div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
                <div
                  className="h-full bg-white transition-all duration-1000"
                  style={{ width: `${((10 - adCountdown) / 10) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              Watch this ad to unlock one Best (Original) quality download.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setShowAd(false); }}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                disabled={!adComplete}
                onClick={() => {
                  setShowAd(false);
                  startConversion();
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {adComplete ? 'Continue to download' : `Wait ${adCountdown}s`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}