"use client";

import { FormEvent, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fullscreenElement, onFullscreenChange, toggleFullscreen } from "@/app/lib/fullscreen";

type Presentation = { id:string; student_name:string; title:string; filename:string; vote_count:number; score:number|null; idea_score:number|null; execution_score:number|null; delivery_score:number|null; potential_score:number|null };
type Session = { group:{ code:string; name:string; project_type:string; phase:string; active_presentation_id:string|null; current_page:number }; presentations:Presentation[] };

export default function StudentRoom({params}:{params:Promise<{code:string}>}) {
  const {code}=use(params); const [data,setData]=useState<Session|null>(null); const [name,setName]=useState(""); const [joined,setJoined]=useState(false); const [uploaded,setUploaded]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [selectedFile,setSelectedFile]=useState(""); const [lastUploaded,setLastUploaded]=useState(""); const [uploadProgress,setUploadProgress]=useState(0);
  const load=useCallback(async()=>{const r=await fetch(`/api/groups/${code}`,{cache:"no-store"}); if(r.ok)setData(await r.json()); else setMessage("Группа с таким кодом не найдена");},[code]);
  useEffect(()=>{const ready=setTimeout(()=>{const saved=localStorage.getItem(`pitchroom-name-${code}`)||"";if(saved){setName(saved);setJoined(true);}setUploaded(localStorage.getItem(`pitchroom-upload-${code}`)==="yes");load();},0);const timer=setInterval(load,1200);return()=>{clearTimeout(ready);clearInterval(timer);};},[code,load]);
  const active=useMemo(()=>data?.presentations.find(p=>p.id===data.group.active_presentation_id)||null,[data]);
  const myPresentations=useMemo(()=>data?.presentations.filter(p=>p.student_name===name)||[],[data,name]);
  function join(e:FormEvent<HTMLFormElement>){e.preventDefault(); const fd=new FormData(e.currentTarget); const n=String(fd.get("name")||"").trim(); if(n.length<3){setMessage("Введите полное ФИО");return;} localStorage.setItem(`pitchroom-name-${code}`,n);setName(n);setJoined(true);setMessage("");}
  async function upload(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;const fd=new FormData(form);const file=fd.get("file");const title=String(fd.get("title")||selectedFile);
    if(!(file instanceof File)){setMessage("Выберите PDF-файл");return;}
    if(file.size>30*1024*1024){setMessage("Файл слишком большой. Максимальный размер — 30 МБ.");return;}
    setBusy(true);setMessage("");setLastUploaded("");setUploadProgress(2);let uploadId="";
    try{
      const init=await fetch(`/api/groups/${code}/uploads`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({studentName:name,title,filename:file.name,size:file.size,type:file.type})});
      const initResult=await readJson(init) as {id?:string;error?:string};
      if(!init.ok||!initResult.id)throw new Error(initResult.error||"Не удалось начать загрузку");
      uploadId=initResult.id;const chunkSize=6*1024*1024;const totalParts=Math.ceil(file.size/chunkSize);const parts:{partNumber:number;etag:string}[]=[];
      for(let index=0;index<totalParts;index++){
        const partNumber=index+1;const chunk=file.slice(index*chunkSize,Math.min((index+1)*chunkSize,file.size));
        const response=await fetch(`/api/groups/${code}/uploads?id=${encodeURIComponent(uploadId)}&part=${partNumber}`,{method:"PUT",headers:{"Content-Type":"application/octet-stream"},body:chunk});
        const result=await readJson(response) as {partNumber?:number;etag?:string;error?:string};
        if(!response.ok||!result.partNumber||!result.etag)throw new Error(response.status===413?"Сервер отклонил слишком большую часть файла":result.error||"Ошибка передачи файла");
        parts.push({partNumber:result.partNumber,etag:result.etag});setUploadProgress(Math.round((partNumber/totalParts)*90));
      }
      const complete=await fetch(`/api/groups/${code}/uploads`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:uploadId,parts})});
      const completeResult=await readJson(complete) as {error?:string};if(!complete.ok)throw new Error(completeResult.error||"Не удалось завершить загрузку");
      setUploadProgress(100);localStorage.setItem(`pitchroom-upload-${code}`,"yes");setUploaded(true);setLastUploaded(title);form.reset();setSelectedFile("");await load();
    }catch(error){if(uploadId)void fetch(`/api/groups/${code}/uploads?id=${encodeURIComponent(uploadId)}`,{method:"DELETE"});setMessage(error instanceof Error?error.message:"Не удалось загрузить PDF. Попробуйте ещё раз.");}
    finally{setBusy(false);}
  }
  if(!data)return <main className="student-page"><div className="student-card center-card"><span className="loader"/><b>{message||"Подключаемся к группе…"}</b></div></main>;
  if(!joined)return <main className="student-page"><header className="student-brand"><span className="brand-mark">P</span> Pitchroom</header><form className="student-card join-card" onSubmit={join}><span className="room-chip">Группа {code}</span><p className="eyebrow">Добро пожаловать</p><h1>{data.group.name}</h1><p>Представьтесь, чтобы загрузить работу и участвовать в оценивании.</p><label>Ваше ФИО<input name="name" placeholder="Иванов Иван Иванович" autoComplete="name"/></label>{message&&<p className="form-error">{message}</p>}<button className="primary full">Войти в группу</button></form></main>;
  if(data.group.phase==="presenting"&&active)return <StudentPresentation active={active} page={data.group.current_page}/>;
  if(data.group.phase==="voting"&&active)return <Voting active={active} name={name} code={code}/>;
  if(data.group.phase==="results"&&active)return <StudentResults active={active}/>;
  return <main className="student-page">
    <header className="student-top"><a className="brand" href={`/g/${code}`}><span className="brand-mark">P</span><span>Pitchroom</span></a><div><b>{name}</b><span className="online"><i/> в группе</span></div></header>
    <section className="student-card upload-card">
      <span className="room-chip">Группа {code}</span><p className="eyebrow">{uploaded?"Работа принята":"Ваша презентация"}</p><h1>{data.group.name}</h1>
      {lastUploaded&&<div className="upload-confirmation" role="status"><span>✓</span><div><b>Презентация загружена</b><small>«{lastUploaded}» уже появилась у преподавателя</small></div></div>}
      {myPresentations.length>0&&<div className="my-uploads"><h2>Загруженные работы <span>{myPresentations.length}</span></h2>{myPresentations.map(p=><div className="my-upload-row" key={p.id}><span className="pdf-badge">PDF</span><div><b>{p.title}</b><small>{p.filename}</small></div><strong>Загружено ✓</strong></div>)}</div>}
      {!uploaded&&<p>Загрузите презентацию проекта в PDF. Максимальный размер файла — 30 МБ.</p>}
      <form onSubmit={upload} aria-busy={busy}>
        <label>Название проекта<input name="title" required disabled={busy} placeholder={data.group.project_type==="game"?"Например, Pixel Forge":"Например, GreenRoute"}/></label>
        <label className={`file-drop ${selectedFile?"has-file":""}`}><input name="file" type="file" accept="application/pdf,.pdf" required disabled={busy} onChange={e=>setSelectedFile(e.target.files?.[0]?.name||"")}/><span>{selectedFile?"✓":"⇧"}</span><b>{selectedFile||"Выберите PDF-файл"}</b><small>{selectedFile?"Файл выбран и готов к загрузке":"или перетащите его сюда"}</small></label>
        {busy&&<div className="upload-progress" role="status"><div><i style={{width:`${uploadProgress}%`}}/></div><b>Загружаем PDF… {uploadProgress}%</b><small>Не закрывайте страницу</small></div>}
        {message&&<p className="form-error">{message}</p>}
        <button disabled={busy||!selectedFile} className="primary full">{busy?"Загрузка…":uploaded?"Загрузить ещё одну презентацию":"Отправить презентацию"}</button>
      </form>
    </section><p className="waiting-note"><i/> Ожидаем начала презентации · экран обновится автоматически</p>
  </main>;
}

async function readJson(response:Response):Promise<unknown>{
  const text=await response.text();
  try{return JSON.parse(text);}catch{return {error:response.status===413?"Файл слишком большой для сервера":text||`Ошибка ${response.status}`};}
}

function StudentPresentation({active,page}:{active:Presentation;page:number}){
  const stageRef=useRef<HTMLElement|null>(null);
  const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>onFullscreenChange(()=>setFullscreen(Boolean(fullscreenElement()))),[]);
  return <main className="student-stage" ref={stageRef}>
    <header><span className="live"><i/> ПРЯМОЙ ЭФИР</span><div><b>{active.title}</b><small>{active.student_name}</small></div><div className="student-stage-actions"><span className="follow">Слайд {page}</span><button className="ghost-button" onClick={()=>void toggleFullscreen(stageRef.current)}>{fullscreen?"⤡ Выйти":"⛶ Полный экран"}</button></div></header>
    <iframe key={`${active.id}-${page}`} title={active.title} allow="fullscreen" tabIndex={-1} src={`/api/files/${active.id}#page=${page}&view=Fit&toolbar=0&navpanes=0`}/>
    <footer>Управляет преподаватель · слайды переключаются автоматически</footer>
  </main>;
}

function Voting({active,name,code}:{active:Presentation;name:string;code:string}){const[voted,setVoted]=useState(()=>typeof localStorage!=="undefined"&&localStorage.getItem(`vote-${active.id}`)==="yes");const[busy,setBusy]=useState(false);const[error,setError]=useState("");async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget);const body={presentationId:active.id,voterName:name,idea:Number(f.get("idea")),execution:Number(f.get("execution")),delivery:Number(f.get("delivery")),potential:Number(f.get("potential")),comment:f.get("comment")};const r=await fetch(`/api/groups/${code}/votes`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json() as {error?:string};setBusy(false);if(!r.ok){setError(j.error||"Не удалось отправить");return;}localStorage.setItem(`vote-${active.id}`,"yes");setVoted(true);}if(voted)return <main className="student-page"><div className="student-card center-card"><span className="success-big">✓</span><h1>Оценка принята</h1><p>Спасибо! Результаты появятся, когда преподаватель завершит голосование.</p><span className="waiting-note"><i/> Ожидаем результаты</span></div></main>;const criteria=[['idea','Идея','Насколько идея интересна и понятна?'],['execution','Реализация','Реалистично ли её воплотить?'],['delivery','Презентация','Насколько убедительной была подача?'],['potential','Потенциал','Есть ли у проекта перспективы?']];return <main className="student-page"><form className="student-card voting-card" onSubmit={submit}><p className="eyebrow">Оцените проект</p><h1>{active.title}</h1><p>{active.student_name}</p><div className="criteria">{criteria.map(([key,label,hint])=><fieldset key={key}><legend><b>{label}</b><small>{hint}</small></legend><div className="rating">{[1,2,3,4,5,6,7,8,9,10].map(n=><label key={n}><input type="radio" name={key} value={n} required/><span>{n}</span></label>)}</div></fieldset>)}</div><label>Комментарий <small>(необязательно)</small><textarea name="comment" placeholder="Что особенно удалось? Что можно улучшить?"/></label>{error&&<p className="form-error">{error}</p>}<button disabled={busy} className="primary full">{busy?"Отправляем…":"Отправить оценку"}</button></form></main>}

function StudentResults({active}:{active:Presentation}){return <main className="student-page"><div className="student-card student-results"><span className="room-chip">Результаты</span><p className="eyebrow">Оценка аудитории</p><h1>{active.title}</h1><div className="overall compact-overall"><span>Средний балл</span><b>{active.score||"—"}</b><small>/ 10</small></div><p>На основе {active.vote_count||0} оценок. Скоро начнётся следующая презентация.</p></div></main>}
