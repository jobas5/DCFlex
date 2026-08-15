import type { CloudflareDatabaseEnv } from "../src/db/client";

export const SESSION_COOKIE = "dcflex_session";
export const SESSION_TTL_SEC = 12 * 60 * 60; // 12 hours

const encoder = new TextEncoder();

/* ------------------------------------------------------------------ */
/* Password hashing (PBKDF2-SHA256 via Web Crypto)                      */
/* Stored format: pbkdf2:iterations:saltHex:hashHex                     */
/* ------------------------------------------------------------------ */

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export async function hashPassword(password: string, iterations = 100000, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  const saltOut = saltHex ?? toHex(salt);
  return `pbkdf2:${iterations}:${saltOut}:${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(env: CloudflareDatabaseEnv, password: string): Promise<boolean> {
  const stored = env.AUTH_PASSWORD_HASH;
  if (!stored) return false;
  const [scheme, iterations, salt, expected] = stored.split(":");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const actual = await hashPassword(password, Number(iterations), salt);
  const actualHash = actual.split(":").pop() ?? "";
  return timingSafeEqual(actualHash, expected);
}

/* ------------------------------------------------------------------ */
/* Session token: base64url(userId).expiresAt.hmac                      */
/* ------------------------------------------------------------------ */

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return b64url(sig);
}

export async function createSession(env: CloudflareDatabaseEnv, userId = "operator"): Promise<string | null> {
  const secret = env.AUTH_SECRET;
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const body = `${b64url(encoder.encode(userId))}.${expiresAt}`;
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function readSession(env: CloudflareDatabaseEnv, token: string): Promise<boolean> {
  const secret = env.AUTH_SECRET;
  if (!secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [userId, expiresAt, sig] = parts;
  const expected = await hmac(secret, `${userId}.${expiresAt}`);
  if (!timingSafeEqual(expected, sig)) return false;
  const exp = Number(expiresAt);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Cookies                                                             */
/* ------------------------------------------------------------------ */

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

export function sessionCookieHeader(token: string, request: Request): string {
  const secure = isSecure(request);
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SEC}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionToken(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=") || null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Login rate limiting (best-effort, per-isolate in-memory)            */
/* ponytail: in-memory counter; a KV/DO-backed limiter is overkill here */
/* ------------------------------------------------------------------ */

const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  rec.count += 1;
  if (rec.count > 10) return true; // >10 failures/min
  return false;
}

export async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}
