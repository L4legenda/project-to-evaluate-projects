import { env } from "cloudflare:workers";
import { headers } from "next/headers";

/**
 * Доступ в админ-панель.
 *
 * Логин и пароль по умолчанию — `admin` / `admin`. Их можно переопределить
 * переменными окружения воркера `ADMIN_LOGIN`, `ADMIN_PASSWORD` и
 * `ADMIN_SESSION_SECRET` (секрет подписи cookie сессии).
 */

export const SESSION_COOKIE = "pitchroom_admin";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

type AuthEnv = {
  ADMIN_LOGIN?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
};

function authEnv(): AuthEnv {
  try {
    return (env ?? {}) as unknown as AuthEnv;
  } catch {
    return {};
  }
}

export function configuredLogin(): string {
  return authEnv().ADMIN_LOGIN?.trim() || "admin";
}

export function configuredPassword(): string {
  return authEnv().ADMIN_PASSWORD || "admin";
}

function sessionSecret(): string {
  return authEnv().ADMIN_SESSION_SECRET || "pitchroom-admin-session-secret";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

/** Сравнение строк без раннего выхода, чтобы не утекала длина совпадающей части. */
function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function credentialsMatch(login: string, password: string): boolean {
  const loginOk = safeEqual(login.trim(), configuredLogin());
  const passwordOk = safeEqual(password, configuredPassword());
  return loginOk && passwordOk;
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = String(Date.now() + SESSION_TTL_SECONDS * 1000);
  return `${expiresAt}.${await sign(expiresAt)}`;
}

export async function isValidSessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return safeEqual(token.slice(separator + 1), await sign(token.slice(0, separator)));
}

export async function readSessionCookie(): Promise<string | null> {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return isValidSessionToken(await readSessionCookie());
}

/**
 * Флаг `Secure` выставляется только когда прокси прямо сообщает про https,
 * иначе вход по обычному http://<IP> переставал бы работать.
 */
export async function requestIsSecure(): Promise<boolean> {
  const requestHeaders = await headers();
  const proto = requestHeaders.get("x-forwarded-proto");
  return proto ? proto.split(",")[0].trim().toLowerCase() === "https" : false;
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
