import assert from "node:assert/strict";
import test from "node:test";
import { authorsOf, isAuthor, normalizeAuthors } from "../app/lib/authors.ts";

test("несколько авторов через запятую сохраняются по порядку", () => {
  assert.equal(normalizeAuthors("Иванов Иван, Петров Пётр"), "Иванов Иван, Петров Пётр");
});

test("разделители: точка с запятой, перенос строки, лишние пробелы", () => {
  assert.equal(
    normalizeAuthors("  Иванов   Иван ; Петров Пётр\nСидоров С.С. "),
    "Иванов Иван, Петров Пётр, Сидоров С.С.",
  );
});

test("дубликаты убираются без учёта регистра", () => {
  assert.equal(normalizeAuthors("Иванов Иван, иванов иван"), "Иванов Иван");
});

test("пустое поле подменяется именем загрузившего", () => {
  assert.equal(normalizeAuthors("", "Иванов Иван"), "Иванов Иван");
  assert.equal(normalizeAuthors(" , ; ", "Иванов Иван"), "Иванов Иван");
  assert.equal(normalizeAuthors(undefined, "Иванов Иван"), "Иванов Иван");
});

test("список авторов ограничен", () => {
  const many = Array.from({ length: 30 }, (_, index) => `Автор ${index}`).join(", ");
  assert.equal(normalizeAuthors(many).split(", ").length, 12);
});

test("authorsOf показывает соавторов, а для старых записей — загрузившего", () => {
  assert.equal(
    authorsOf({ authors: "Иванов Иван, Петров Пётр", student_name: "Иванов Иван" }),
    "Иванов Иван, Петров Пётр",
  );
  assert.equal(authorsOf({ authors: null, student_name: "Иванов Иван" }), "Иванов Иван");
  assert.equal(authorsOf({ student_name: "Иванов Иван" }), "Иванов Иван");
});

test("isAuthor узнаёт и загрузившего, и соавтора", () => {
  const presentation = { authors: "Иванов Иван, Петров Пётр", student_name: "Иванов Иван" };
  assert.equal(isAuthor(presentation, "Петров Пётр"), true);
  assert.equal(isAuthor(presentation, " петров пётр "), true);
  assert.equal(isAuthor(presentation, "Сидоров С.С."), false);
  assert.equal(isAuthor(presentation, ""), false);
});
