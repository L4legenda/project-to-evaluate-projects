/**
 * Копирует воркер PDF.js в public/.
 *
 * Воркер нельзя подключать напрямую из node_modules: в dev-режиме Vite
 * обрабатывает такие файлы как обычные модули и подмешивает в них свой
 * клиент, а внутри воркера он падает на `window is not defined`.
 * Файлы из public/ Vite отдаёт как есть — и в dev, и в сборке.
 *
 * Запускается автоматически перед dev/lan/build (см. package.json).
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const source = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const target = join(root, "public", "pdf.worker.min.mjs");

const sourceInfo = await stat(source).catch(() => null);
if (!sourceInfo) {
  console.error(`[pdf-worker] не найден ${source} — выполните npm install`);
  process.exit(1);
}
const targetInfo = await stat(target).catch(() => null);
if (targetInfo && targetInfo.size === sourceInfo.size && targetInfo.mtimeMs >= sourceInfo.mtimeMs) {
  console.log("[pdf-worker] public/pdf.worker.min.mjs уже актуален");
} else {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log("[pdf-worker] public/pdf.worker.min.mjs обновлён");
}
