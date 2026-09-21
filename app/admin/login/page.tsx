"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: String(data.get("login") || ""),
          password: String(data.get("password") || ""),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Не удалось войти");
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand"><span className="brand-mark">P</span><span>Pitchroom</span></div>
      <form className="login-card" onSubmit={signIn}>
        <p className="eyebrow">Панель преподавателя</p>
        <h1>Вход в админ-панель</h1>
        <p className="login-hint">Введите логин и пароль, чтобы создавать сессии, собирать презентации и управлять защитой проектов.</p>
        <label>Логин<input name="login" autoComplete="username" required /></label>
        <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? "Проверяем…" : "Войти"}</button>
      </form>
    </main>
  );
}
