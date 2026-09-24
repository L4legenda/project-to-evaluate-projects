/**
 * Переключение слайдов кликером.
 *
 * Кликер (пульт презентации) отправляет нажатия быстрее, чем успевает
 * ответить сервер, поэтому запросы нельзя отправлять «в лоб»: два быстрых
 * нажатия ушли бы с одной и той же страницей и второе потерялось бы.
 * Здесь нажатия выстраиваются в очередь: пока один запрос в полёте,
 * следующие только обновляют цель, а по завершении отправляется последняя.
 */

export type SlideSender = (page: number) => Promise<void>;

export type SlideStepper = {
  /** Сдвинуть слайд на delta (обычно +1 или -1). */
  step: (delta: number) => void;
  /** Синхронизация с сервером, когда он не занят нашей отправкой. */
  sync: (page: number) => void;
  /** Текущая целевая страница. */
  current: () => number;
  /** Ждёт завершения всех отправок (нужно тестам). */
  idle: () => Promise<void>;
};

export function createSlideStepper(initialPage: number, send: SlideSender): SlideStepper {
  let target = initialPage;
  let busy = false;
  let queued: number | null = null;
  let running: Promise<void> = Promise.resolve();

  async function drain(first: number): Promise<void> {
    try {
      let desired: number | null = first;
      while (desired !== null) {
        queued = null;
        await send(desired);
        desired = queued;
      }
    } finally {
      busy = false;
    }
  }

  return {
    step(delta) {
      const next = Math.max(1, target + delta);
      if (next === target) return;
      target = next;
      if (busy) {
        queued = next;
        return;
      }
      busy = true;
      running = drain(next);
    },
    sync(page) {
      if (!busy) target = page;
    },
    current() {
      return target;
    },
    idle() {
      return running;
    },
  };
}
