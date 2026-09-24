/**
 * Масштаб, при котором страница PDF целиком помещается в отведённое место.
 *
 * Возвращает число, на которое умножается размер страницы в пунктах.
 * Если размеры контейнера ещё не известны (0), берём масштаб 1 — иначе
 * canvas получился бы нулевого размера и слайд выглядел бы пустым.
 */
export function fitScale(pageWidth: number, pageHeight: number, boxWidth: number, boxHeight: number): number {
  if (!(pageWidth > 0) || !(pageHeight > 0)) return 1;
  if (!(boxWidth > 0) || !(boxHeight > 0)) return 1;
  const scale = Math.min(boxWidth / pageWidth, boxHeight / pageHeight);
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.max(0.1, scale);
}
