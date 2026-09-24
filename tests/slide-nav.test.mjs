import assert from "node:assert/strict";
import test from "node:test";
import { createSlideStepper } from "../app/lib/slide-nav.ts";

/** Отправитель, который запоминает вызовы и позволяет придержать первый из них. */
function recorder() {
  const sent = [];
  let release = null;
  const send = async (page) => {
    sent.push(page);
    if (release) {
      const done = release;
      release = null;
      await new Promise((resolve) => { done(); resolve(); });
    }
  };
  return {
    sent,
    send,
    /** Задерживает следующий вызов send до тех пор, пока не вызовут release. */
    hold() {
      let unlock = () => {};
      release = unlock;
      return () => { unlock(); };
    },
  };
}

test("одно нажатие отправляет следующую страницу", async () => {
  const r = recorder();
  const stepper = createSlideStepper(1, r.send);
  stepper.step(1);
  await stepper.idle();
  assert.deepEqual(r.sent, [2]);
  assert.equal(stepper.current(), 2);
});

test("не уходит ниже первого слайда", async () => {
  const r = recorder();
  const stepper = createSlideStepper(1, r.send);
  stepper.step(-1);
  stepper.step(-1);
  await stepper.idle();
  assert.deepEqual(r.sent, []);
  assert.equal(stepper.current(), 1);
});

test("быстрые нажатия не теряются и не откатываются", async () => {
  const r = recorder();
  const stepper = createSlideStepper(1, r.send);
  const release = r.hold();      // первый запрос «висит»
  stepper.step(1);               // цель 2 — запрос уже в полёте
  stepper.step(1);               // цель 3
  stepper.step(1);               // цель 4
  assert.deepEqual(r.sent, [2]);
  release();
  await stepper.idle();
  assert.deepEqual(r.sent, [2, 4], "уходит только последняя цель");
  assert.equal(stepper.current(), 4);
});

test("вперёд и назад подряд дают верную страницу", async () => {
  const r = recorder();
  const stepper = createSlideStepper(5, r.send);
  stepper.step(1);
  stepper.step(-1);
  stepper.step(-1);
  await stepper.idle();
  assert.equal(r.sent.at(-1), 4);
  assert.equal(stepper.current(), 4);
});

test("sync с сервером откатывает цель, когда ничего не отправляется", () => {
  const r = recorder();
  const stepper = createSlideStepper(1, r.send);
  stepper.sync(7);
  assert.equal(stepper.current(), 7);
});
