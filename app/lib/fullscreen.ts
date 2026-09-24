/**
 * Полноэкранный режим с запасом на Safari (webkit-префиксы).
 * Используется на экране показа и на студенческой странице.
 */

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function fullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as WebkitFullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export async function enterFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return;
  const target = element as WebkitFullscreenElement;
  if (typeof target.requestFullscreen === "function") await target.requestFullscreen();
  else if (typeof target.webkitRequestFullscreen === "function") await target.webkitRequestFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as WebkitFullscreenDocument;
  if (typeof doc.exitFullscreen === "function") await doc.exitFullscreen();
  else if (typeof doc.webkitExitFullscreen === "function") await doc.webkitExitFullscreen();
}

export function toggleFullscreen(element: HTMLElement | null): Promise<void> {
  return fullscreenElement() ? exitFullscreen() : enterFullscreen(element);
}

/** Подписка на смену режима; возвращает функцию отписки. */
export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  return () => {
    document.removeEventListener("fullscreenchange", handler);
    document.removeEventListener("webkitfullscreenchange", handler);
  };
}
