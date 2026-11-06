/**
 * Static file delivery for the core: correct cache headers and brotli/gzip for text.
 * Before this every file was sent `no-store` and uncompressed, so each visit re-downloaded the 1.2 MB console bundle.
 *   console-assets/*  content-hashed by Vite       -> cache for a year, immutable
 *   vendor, media, demo, fonts, images             -> cache for a day (a short window for demo data)
 *   html and the unhashed scripts and styles       -> always revalidate (ETag, so an unchanged file is a 304)
 */
import { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const COMPRESSIBLE = /^(text\/|application\/json|application\/javascript|image\/svg)/;

export function cacheControl(rel: string): string {
  const p = rel.replace(/^\/+/, "");
  if (p.startsWith("console-assets/")) return "public, max-age=31536000, immutable";
  if (p.startsWith("demo/")) return "public, max-age=3600";
  if (p.startsWith("vendor/") || p.startsWith("media/") || /\.(woff2?|jpe?g|png|svg|obj)$/.test(p)) return "public, max-age=86400";
  return "no-cache";
}

type Entry = { raw: Buffer; br?: Buffer; gz?: Buffer; etag: string };
const cache = new Map<string, Entry>();

export function pickEncoding(acceptEncoding: string | undefined, mime: string, size: number): "br" | "gzip" | null {
  if (!COMPRESSIBLE.test(mime) || size < 1024) return null;
  const a = acceptEncoding ?? "";
  if (/\bbr\b/.test(a)) return "br";
  if (/\bgzip\b/.test(a)) return "gzip";
  return null;
}

export function sendStatic(req: IncomingMessage, res: ServerResponse, file: string, rel: string, mime: string) {
  const st = statSync(file);
  const key = `${file}:${st.mtimeMs}:${st.size}`;
  let e = cache.get(key);
  if (!e) {
    // drop stale versions of the same file so a rebuilt bundle does not pile up in memory
    for (const k of cache.keys()) if (k.startsWith(`${file}:`)) cache.delete(k);
    e = { raw: readFileSync(file), etag: `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"` };
    cache.set(key, e);
  }
  const headers: Record<string, string> = { "content-type": mime, "cache-control": cacheControl(rel), etag: e.etag, vary: "accept-encoding" };
  if (req.headers["if-none-match"] === e.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const enc = pickEncoding(req.headers["accept-encoding"] as string | undefined, mime, e.raw.length);
  let body = e.raw;
  if (enc === "br") body = e.br ??= brotliCompressSync(e.raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 6, [constants.BROTLI_PARAM_SIZE_HINT]: e.raw.length } });
  else if (enc === "gzip") body = e.gz ??= gzipSync(e.raw, { level: 6 });
  if (enc) headers["content-encoding"] = enc;
  headers["content-length"] = String(body.length);
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}
