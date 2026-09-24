import assert from "node:assert/strict";
import test from "node:test";
import { fitScale } from "../app/lib/fit-scale.ts";

test("широкая страница ограничена шириной окна", () => {
  assert.equal(fitScale(100, 50, 1000, 1000), 10);
});

test("высокая страница ограничена высотой окна", () => {
  assert.equal(fitScale(50, 100, 1000, 1000), 10);
});

test("альбомная страница A4 в окне 16:9 ограничена высотой", () => {
  // 842×595 — шире, чем окно 1280×720 по соотношению сторон,
  // поэтому вписывается по высоте.
  assert.equal(fitScale(842, 595, 1280, 720), 720 / 595);
});

test("вписанная страница не выходит за границы окна", () => {
  const cases = [[842, 595, 1280, 720], [595, 842, 1280, 720], [1000, 100, 300, 900], [300, 900, 1000, 100]];
  for (const [pw, ph, bw, bh] of cases) {
    const scale = fitScale(pw, ph, bw, bh);
    assert.ok(pw * scale <= bw + 1e-9, `ширина ${pw * scale} > ${bw}`);
    assert.ok(ph * scale <= bh + 1e-9, `высота ${ph * scale} > ${bh}`);
  }
});

test("неизвестный размер контейнера не даёт нулевой масштаб", () => {
  assert.equal(fitScale(842, 595, 0, 0), 1);
  assert.equal(fitScale(0, 0, 1280, 720), 1);
  assert.ok(fitScale(842, 595, 0, 720) > 0);
});

test("масштаб всегда положительный и конечный", () => {
  for (const [pw, ph, bw, bh] of [[1, 1, 1, 1], [1000, 1000, 10, 10], [100, 100, 100000, 5]]) {
    const scale = fitScale(pw, ph, bw, bh);
    assert.ok(Number.isFinite(scale) && scale > 0, `scale=${scale}`);
  }
});
