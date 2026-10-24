// Server-only outgoing HTTP requests used by the product image proxy.
// DNS addresses are checked AND pinned for the connection to prevent DNS
// rebinding after a preflight lookup. Redirects are checked hop by hop.
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;

function isPublicIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  // RFC 6598, link-local, documentation, loopback, shared, benchmarking,
  // multicast and reserved blocks must never be used by the image proxy.
  return true;
}

function isPublicIpv6(ip) {
  const raw = ip.toLowerCase().split("%")[0];
  if (raw.includes(".")) return false; // reject IPv4-mapped/embedded variants
  if (!raw || raw === "::" || raw === "::1") return false;
  const expanded = raw.split("::");
  if (expanded.length > 2) return false;
  const first = parseInt(expanded[0].split(":")[0] || "0", 16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
  // 2001:db8::/32 documentation range
  if (raw.startsWith("2001:db8:") || raw === "2001:db8::") return false;
  if (raw.startsWith("2001:0:") || raw.startsWith("2001::") || raw.startsWith("2002:")) return false;
  return true;
}

export function isPublicAddress(ip) {
  const family = net.isIP(String(ip || ""));
  return family === 4 ? isPublicIpv4(ip) : family === 6 ? isPublicIpv6(ip) : false;
}

function trustedStorageOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch { return ""; }
}

export function validateProductImageTarget(raw, { supabaseUrl = "" } = {}) {
  let url;
  try { url = new URL(String(raw || "")); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname || url.hash) return null;
  if (url.hostname.includes("%")) return null;
  const configuredOrigin = trustedStorageOrigin(supabaseUrl);
  const trustedStorage = Boolean(configuredOrigin && url.origin === configuredOrigin && url.pathname.startsWith("/storage/v1/"));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!trustedStorage && /(^|\.)localhost\.?$|\.local\.?$|\.internal\.?$/i.test(hostname)) return null;
  if (net.isIP(hostname) && !trustedStorage && !isPublicAddress(hostname)) return null;
  if (!trustedStorage && url.port && !["80", "443"].includes(url.port)) return null;
  return { url, trustedStorage };
}

export async function resolveProductImageTarget(raw, { supabaseUrl = "", lookup = dns.lookup } = {}) {
  const target = validateProductImageTarget(raw, { supabaseUrl });
  if (!target) return null;
  const { url, trustedStorage } = target;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literal = net.isIP(hostname);
  if (literal) return { ...target, addresses: [{ address: hostname, family: literal }] };
  let addresses;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { return null; }
  if (!Array.isArray(addresses) || !addresses.length) return null;
  if (addresses.some(({ address }) => !net.isIP(address) || (!trustedStorage && !isPublicAddress(address)))) return null;
  return { ...target, addresses };
}

export async function fetchProductImageResource(raw, {
  supabaseUrl = "", headers = {}, maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS, maxRedirects = 3, lookup = dns.lookup,
} = {}) {
  let current = String(raw || "");
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = await resolveProductImageTarget(current, { supabaseUrl, lookup });
    if (!target) return null;
    const { url, addresses } = target;
    // Only forward the configured Supabase credential to its trusted Storage
    // endpoint; redirects must never inherit the authorization header.
    const passAuth = target.trustedStorage;
    const safeHeaders = { ...headers };
    if (!passAuth) {
      delete safeHeaders.apikey;
      delete safeHeaders.Authorization;
      delete safeHeaders.authorization;
    }
    const requestOptions = {
      protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, ""), port: url.port || undefined,
      path: `${url.pathname}${url.search}`, method: "GET", headers: safeHeaders,
      // Address pinning ensures the TCP socket uses the address we validated.
      lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, addresses[0].family),
      timeout: timeoutMs,
    };
    const response = await new Promise(resolve => {
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(requestOptions, res => {
        const chunks = []; let bytes = 0;
        const declared = Number(res.headers["content-length"] || 0);
        if (declared > maxBytes) { req.destroy(); resolve(null); return; }
        res.on("data", chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) { req.destroy(); return; }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(bytes > maxBytes ? null : {
          status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), url: current,
        }));
        res.on("error", () => resolve(null));
        res.on("close", () => { if (!res.complete) resolve(null); });
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(null));
      req.end();
    });
    if (!response) return null;
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop >= maxRedirects || !response.headers.location) return null;
      try { current = new URL(response.headers.location, current).href; }
      catch { return null; }
      continue;
    }
    return response.status >= 200 && response.status < 300 ? response : null;
  }
  return null;
}
