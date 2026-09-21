"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { copyText } from "@/app/lib/clipboard";

type Presentation = { id:string; student_name:string; title:string; filename:string; vote_count:number; score:number|null; idea_score:number|null; execution_score:number|null; delivery_score:number|null; potential_score:number|null };
type Session = { group:{ code:string; name:string; project_type:string; phase:string; active_presentation_id:string|null; current_page:number }; presentations:Presentation[] };

export default function AdminSession({ params }: { params: Promise<{ code:string }> }) {
  const { code } = use(params);
  const [data, setData] = useState<Session|null>(null);
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/groups/${code}`, { cache:"no-store" });
    if (res.ok) setData(await res.json()); else setError("Сессия не найдена");
  }, [code]);

  useEffect(() => { const ready=setTimeout(()=>{ setKey(new URLSearchParams(location.search).get("key") || ""); load(); },0); const timer=setInterval(load,1200); return()=>{clearTimeout(ready);clearInterval(timer);}; }, [load]);
  const active = useMemo(() => data?.presentations.find(p => p.id === data.group.active_presentation_id) || null, [data]);

  async function control(phase:string, presentationId:string|null, page=1) {
    const res = await fetch(`/api/groups/${code}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ adminKey:key, phase, presentationId, page }) });
    if (!res.ok) { const r=await res.json() as {error?:string}; setError(r.error || "Не удалось изменить режим"); return; } await load();
  }
  async function copyLink() {
    const success = await copyText(`${location.origin}/g/${code}`);
    if (!success) { setError("Не удалось скопировать ссылку. Выделите её вручную."); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (error && !data) return <main className="center-state"><b>{error}</b><Link href="/admin">Вернуться в панель</Link></main>;
  if (!data) return <main className="center-state"><span className="loader"/><b>Загружаем сессию…</b></main>;

  return <main className="room-shell">
    <header className="room-header"><Link className="brand" href="/admin"><span className="brand-mark">P</span><span>Pitchroom</span></Link><div className="room-title"><b>{data.group.name}</b><span>{data.group.project_type === "game" ? "Видеоигры" : "Бизнес-идеи"}</span></div><div className="live-users"><i/> Синхронизация включена</div></header>
    {data.group.phase === "presenting" && active ? <PresenterView active={active} page={data.group.current_page} onPage={(p)=>control("presenting",active.id,p)} onFinish={()=>control("voting",active.id,data.group.current_page)} /> :
     data.group.phase === "voting" && active ? <AdminVoting active={active} onResults={()=>control("results",active.id,data.group.current_page)} /> :
     data.group.phase === "results" && active ? <Results active={active} onNext={()=>control("waiting",null,1)} /> :
     <div className="admin-grid">
       <section className="admin-main"><div className="session-hero"><div><p className="eyebrow">Сессия готова</p><h1>{data.group.name}</h1><p>Студенты открывают ссылку, вводят ФИО и загружают свои PDF.</p></div><div className="code-box"><small>Код группы</small><b>{code}</b></div></div>
         <div className="share-box"><div><small>Ссылка для студентов</small><strong>{typeof location !== "undefined" ? `${location.origin}/g/${code}` : `/g/${code}`}</strong></div><button className="outline-button" onClick={copyLink}>{copied ? "Скопировано ✓" : "Копировать ссылку"}</button></div>
         <div className="list-head"><div><h2>Загруженные презентации</h2><span>{data.presentations.length}</span></div><small>Нажмите «Начать», когда автор будет готов</small></div>
         <div className="presentation-list">{data.presentations.map((p,i)=><article className="presentation-row" key={p.id}><span className="order">{String(i+1).padStart(2,"0")}</span><span className="pdf-badge">PDF</span><div><b>{p.title}</b><small>{p.student_name} · {p.filename}</small></div>{p.score && <span className="mini-score">★ {p.score}</span>}<button className="primary compact" onClick={()=>control("presenting",p.id,1)}>Начать <span>→</span></button></article>)}{!data.presentations.length&&<div className="empty-upload"><span>⇧</span><b>Ждём первые презентации</b><p>Список обновится автоматически после загрузки.</p></div>}</div>
       </section>
       <aside className="admin-aside"><h3>Как провести защиту</h3><ol><li><b>Поделитесь ссылкой</b><span>Студенты загрузят свои работы</span></li><li><b>Запустите презентацию</b><span>Слайды синхронно откроются у всех</span></li><li><b>Откройте оценивание</b><span>Каждый оценит проект по 4 критериям</span></li><li><b>Покажите результаты</b><span>Средние баллы появятся на общем экране</span></li></ol><div className="tip"><b>Совет</b><p>Откройте студенческую ссылку на втором устройстве, чтобы проверить показ.</p></div></aside>
     </div>}
    {error && <div className="toast error">{error}</div>}
  </main>;
}

function PresenterView({active,page,onPage,onFinish}:{active:Presentation;page:number;onPage:(p:number)=>void;onFinish:()=>void}) {
  return <section className="stage"><div className="stage-bar"><div><span className="live"><i/> ПРЯМОЙ ЭФИР</span><b>{active.title}</b><small>{active.student_name}</small></div><button className="danger-button" onClick={onFinish}>Завершить показ</button></div><div className="pdf-stage"><iframe key={`${active.id}-${page}`} title={active.title} src={`/api/files/${active.id}#page=${page}&view=FitH&toolbar=0&navpanes=0`} /></div><div className="stage-controls"><button disabled={page<=1} onClick={()=>onPage(page-1)}>←</button><span>Слайд <b>{page}</b></span><button onClick={()=>onPage(page+1)}>→</button><small>Слайд меняется у всех участников</small></div></section>;
}

function AdminVoting({active,onResults}:{active:Presentation;onResults:()=>void}) { return <section className="mode-screen"><span className="mode-icon">★</span><p className="eyebrow">Оценивание открыто</p><h1>{active.title}</h1><p>Студенты оценивают идею, реализацию, подачу и потенциал проекта.</p><div className="vote-counter"><b>{active.vote_count || 0}</b><span>оценок получено</span></div><button className="primary wide" onClick={onResults}>Показать результаты</button></section>; }

function Results({active,onNext}:{active:Presentation;onNext:()=>void}) {
  const rows=[['Идея',active.idea_score],['Реализация',active.execution_score],['Презентация',active.delivery_score],['Потенциал',active.potential_score]] as const;
  return <section className="results-screen"><div className="result-copy"><p className="eyebrow">Результаты оценки</p><h1>{active.title}</h1><p>{active.student_name} · {active.vote_count || 0} оценок</p><div className="overall"><span>Итоговый балл</span><b>{active.score || "—"}</b><small>/ 10</small></div><button className="primary wide" onClick={onNext}>Вернуться к списку проектов →</button></div><div className="result-chart">{rows.map(([label,value])=><div className="score-row" key={label}><span>{label}</span><div><i style={{width:`${(value||0)*10}%`}}/></div><b>{value || "—"}</b></div>)}<div className="result-note">Результаты обновляются на основе анонимизированных оценок участников.</div></div></section>;
}
