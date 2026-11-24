// URL validation + SSRF protection.
import dns from 'node:dns/promises';
import net from 'node:net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function normalizeUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
  if (!u.hostname) return null;
  // strip credentials
  u.username = '';
  u.password = '';
  return u.toString();
}

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIP(ip) === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80')) return true;
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // ULA
    if (low.startsWith('ff')) return true;
    // IPv4-mapped
    const m = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return false;
}

export async function isSafeUrl(urlStr) {
  const u = new URL(urlStr);
  const host = u.hostname;
  // block obvious local hostnames
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  // if hostname is an IP literal
  if (net.isIP(host)) return !isPrivateIp(host);
  // resolve and check
  try {
    const res = await dns.lookup(host, { all: true });
    for (const r of res) {
      if (isPrivateIp(r.address)) return false;
    }
    if (res.length === 0) return false;
    return true;
  } catch {
    return false;
  }
}

export const MAX_URL_LENGTH = 2048;