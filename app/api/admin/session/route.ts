import {
  clearedSessionCookie,
  createSessionToken,
  credentialsMatch,
  requestIsSecure,
  sessionCookie,
} from "@/app/lib/auth";
import { json } from "@/app/lib/store";

export const dynamic = "force-dynamic";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "local"
  );
}

function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(key: string) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/** Вход в админ-панель: логин и пароль по умолчанию — admin / admin. */
export async function POST(request: Request) {
  const key = clientKey(request);
  if (tooManyAttempts(key)) {
    return json(
      { error: "Слишком много попыток входа. Подождите 5 минут." },
      { status: 429 },
    );
  }

  let body: { login?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { login?: unknown; password?: unknown };
  } catch {
    return json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const login = typeof body.login === "string" ? body.login : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!credentialsMatch(login, password)) {
    registerFailure(key);
    return json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  attempts.delete(key);
  const token = await createSessionToken();
  const secure = await requestIsSecure();
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(token, secure) } });
}

/** Выход из админ-панели. */
export async function DELETE() {
  const secure = await requestIsSecure();
  return json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie(secure) } });
}
