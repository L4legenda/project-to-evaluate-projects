"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { fitScale } from "@/app/lib/fit-scale";

type Props = {
  /** id презентации — файл отдаётся по /api/files/<id> */
  fileId: string;
  page: number;
  /** Сколько всего страниц в документе (как только узнали). */
  onPageCount?: (count: number) => void;
};

/** Сколько ждём открытия документа, прежде чем вернуться к показу через iframe. */
const LOAD_TIMEOUT_MS = 20000;

/**
 * Показ PDF постранично.
 *
 * Документ загружается и разбирается один раз, дальше на смену слайда
 * просто перерисовывается нужная страница — в отличие от <iframe>, который
 * на каждую страницу заново скачивал и разбирал весь файл (большие
 * презентации из-за этого переключались по несколько секунд).
 *
 * Компонент рассчитан на монтирование под конкретный файл: при смене
 * презентации родитель задаёт key={active.id}.
 *
 * Если PDF.js почему-то не смог (нет воркера, битый файл) — откатываемся
 * на прежний показ через <iframe>, чтобы защита не останавливалась.
 */
export default function PdfCanvas({ fileId, page, onPageCount }: Props) {
  const holderRef = useRef<HTMLDivElement|null>(null);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const docRef = useRef<PDFDocumentProxy|null>(null);
  const countRef = useRef(onPageCount);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => { countRef.current = onPageCount; }, [onPageCount]);

  // 1. Загружаем документ один раз на файл.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>|null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Воркер берём из public/ (его копирует scripts/copy-pdf-worker.mjs).
      // Из node_modules подключать нельзя: в dev-режиме Vite обрабатывает
      // такой файл как обычный модуль, подмешивает в него свой клиент, и
      // внутри воркера всё падает на `window is not defined`.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ url: `/api/files/${fileId}`, isEvalSupported: false });
      try {
        const doc = await Promise.race([
          task.promise,
          new Promise<never>((_, reject) => {
            // Если документ не открылся за это время, показываем слайды
            // прежним способом — лучше медленнее, чем пустой экран на защите.
            timer = setTimeout(() => reject(new Error("PDF не открылся вовремя")), LOAD_TIMEOUT_MS);
          }),
        ]);
        if (timer) { clearTimeout(timer); timer = null; }
        if (cancelled) { void doc.destroy(); return; }
        docRef.current = doc;
        countRef.current?.(doc.numPages);
        setReady(true);
      } catch {
        if (timer) { clearTimeout(timer); timer = null; }
        void task.destroy();
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy();
    };
  }, [fileId]);

  // 2. Рисуем текущую страницу, вписывая её целиком в отведённое место.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let task: RenderTask|null = null;
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      const holder = holderRef.current;
      if (!doc || !canvas || !holder) return;
      const pdfPage = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const width = holder.clientWidth || base.width;
      const height = holder.clientHeight || base.height;
      const scale = fitScale(base.width, base.height, width, height);
      // Рисуем с запасом по плотности экрана, а показываем в логическом размере.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const display = pdfPage.getViewport({ scale });
      const output = pdfPage.getViewport({ scale: scale * ratio });
      canvas.width = Math.floor(output.width);
      canvas.height = Math.floor(output.height);
      canvas.style.width = `${Math.floor(display.width)}px`;
      canvas.style.height = `${Math.floor(display.height)}px`;
      task = pdfPage.render({ canvas, viewport: output });
      await task.promise;
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* отрисовка уже завершена */ }
    };
  }, [ready, page, resizeTick]);

  // 3. Перерисовываем при изменении размера окна или выхода в полный экран.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setResizeTick((tick) => tick + 1));
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return <iframe key={`${fileId}-${page}`} title="Презентация" allow="fullscreen" tabIndex={-1} src={`/api/files/${fileId}#page=${page}&view=Fit&toolbar=0&navpanes=0`} />;
  }

  return <div className="pdf-canvas" ref={holderRef}>
    <canvas ref={canvasRef} aria-label="Слайд презентации" />
    {!ready && <div className="pdf-canvas-state" role="status"><span className="loader"/><b>Готовим презентацию…</b></div>}
  </div>;
}
