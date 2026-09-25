/**
 * Авторы презентации.
 *
 * Работу может защищать команда, поэтому студент перечисляет соавторов через
 * запятую. Хранится список уже нормализованным: без дублей, лишних пробелов и
 * разделителей-хвостов.
 */

export const MAX_AUTHORS = 12;
export const MAX_AUTHOR_LENGTH = 80;

/**
 * Приводит ввод к строке вида `Иванов Иван, Петров Пётр`.
 * Если студент ничего не указал, подставляется `fallback` (обычно — его ФИО).
 */
export function normalizeAuthors(value: unknown, fallback = ""): string {
  const raw = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
  const names = raw
    .split(/[,;\n\r]+/)
    .map((name) => name.replace(/\s+/g, " ").trim().slice(0, MAX_AUTHOR_LENGTH))
    .filter(Boolean);
  const unique = names.filter(
    (name, index) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index,
  );
  const list = unique.length ? unique : [fallback.replace(/\s+/g, " ").trim()];
  return list.filter(Boolean).slice(0, MAX_AUTHORS).join(", ");
}

type PresentationNames = { authors?: string | null; student_name?: string | null };

/** Авторы работы; у презентаций прошлых версий колонки нет — показываем загрузившего. */
export function authorsOf(presentation: PresentationNames): string {
  return presentation.authors?.trim() || (presentation.student_name || "").trim();
}

/** Считается ли студент автором работы — в том числе если он только соавтор. */
export function isAuthor(presentation: PresentationNames, name: string): boolean {
  const target = name.trim().toLowerCase();
  if (!target) return false;
  if ((presentation.student_name || "").trim().toLowerCase() === target) return true;
  return (presentation.authors || "")
    .split(",")
    .some((author) => author.trim().toLowerCase() === target);
}
