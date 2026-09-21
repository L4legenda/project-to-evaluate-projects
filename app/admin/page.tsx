"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { copyText } from "@/app/lib/clipboard";

type SavedGroup = { code: string; adminKey: string; name: string; projectType: string };

export default function AdminPage() {
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      try { setGroups(JSON.parse(localStorage.getItem("pitchroom-admin-groups") || "[]")); } catch { setGroups([]); }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function createGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "");
    const projectType = String(data.get("projectType") || "business");
    const response = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, projectType }) });
    const result = await response.json() as { code?: string; adminKey?: string; error?: string };
    if (!response.ok || !result.code || !result.adminKey) { setError(result.error || "Не удалось создать сессию"); setBusy(false); return; }
    const next = [{ code: result.code, adminKey: result.adminKey, name, projectType }, ...groups];
    localStorage.setItem("pitchroom-admin-groups", JSON.stringify(next));
    window.location.href = `/admin/${result.code}?key=${result.adminKey}`;
  }

  return (
    <main className="shell">
      <Header />
      <section className="hero">
        <div><p className="eyebrow">Панель преподавателя</p><h1>Ваши защиты проектов</h1><p className="hero-copy">Создайте сессию, соберите PDF и проведите синхронную презентацию.</p></div>
        <button className="primary" onClick={() => setCreating(true)}><span>＋</span> Новая сессия</button>
      </section>
      <section className="metrics" aria-label="Сводка">
        <article><span className="metric-icon purple">↗</span><div><b>{groups.length}</b><small>Сессий создано</small></div><em>на этом устройстве</em></article>
        <article><span className="metric-icon mint">▣</span><div><b>PDF</b><small>Формат презентаций</small></div><em>до 30 МБ</em></article>
        <article><span className="metric-icon amber">★</span><div><b>4</b><small>Критерия оценки</small></div><em>по 10 баллов</em></article>
      </section>
      <section className="section-head"><div><h2>Текущие сессии</h2><p>Ссылки и управление доступны только в этом браузере</p></div></section>
      <section className="sessions">
        {groups.map((group, index) => <article className={`session-card ${index === 0 ? "featured" : ""}`} key={group.code}>
          <div className="card-top"><span className={index === 0 ? "live" : "scheduled"}>{index === 0 && <i />} {index === 0 ? "ПОСЛЕДНЯЯ" : "СЕССИЯ"}</span><span className="session-code">{group.code}</span></div>
          <h3>{group.name}</h3><p>{group.projectType === "game" ? "Проекты видеоигр" : "Бизнес-идеи"}</p>
          <div className="share-preview"><span>/g/{group.code}</span><button onClick={() => void copyText(`${location.origin}/g/${group.code}`)}>Копировать</button></div>
          <div className="card-bottom"><span className="muted-caption">Создана вами</span><a className="enter" href={`/admin/${group.code}?key=${group.adminKey}`}>Открыть сессию <b>→</b></a></div>
        </article>)}
        <button className="new-card" onClick={() => setCreating(true)}><span>＋</span><b>Создать новую сессию</b><small>Ссылка для студентов появится сразу</small></button>
      </section>
      {!groups.length && <div className="empty-note"><b>Сессий пока нет</b><span>Начните с кнопки «Новая сессия» — это займёт меньше минуты.</span></div>}
      {creating && <dialog open className="modal-backdrop"><form className="modal" onSubmit={createGroup}><button type="button" className="modal-close" onClick={() => setCreating(false)}>×</button><p className="eyebrow">Новая сессия</p><h2>Создайте пространство группы</h2><label>Название сессии<input name="name" required placeholder="Например, Бизнес-идеи · ИТ-21" /></label><label>Тематика<select name="projectType"><option value="business">Бизнес-идеи</option><option value="game">Видеоигры</option></select></label>{error && <p className="form-error">{error}</p>}<button disabled={busy} className="primary full">{busy ? "Создаём…" : "Создать и получить ссылку"}</button></form></dialog>}
    </main>
  );
}

function Header() {
  return <header className="topbar"><Link className="brand" href="/admin"><span className="brand-mark">P</span><span>Pitchroom</span></Link><div className="top-actions"><span className="status-dot" /> Система готова <span className="avatar">АД</span></div></header>;
}
