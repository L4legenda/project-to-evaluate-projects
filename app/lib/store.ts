import { env } from "cloudflare:workers";

export type GroupRow = {
  id: string;
  code: string;
  name: string;
  project_type: string;
  admin_key: string;
  phase: "waiting" | "presenting" | "voting" | "results";
  active_presentation_id: string | null;
  current_page: number;
  created_at: string;
};

export type PresentationRow = {
  id: string;
  group_id: string;
  student_name: string;
  authors: string | null;
  title: string;
  filename: string;
  object_key: string;
  created_at: string;
};

let initialized = false;

export function bindings() {
  return env as unknown as { DB: D1Database; FILES: R2Bucket };
}

/**
 * Колонки, появившиеся после первого релиза: `CREATE TABLE IF NOT EXISTS` их в
 * уже существующей таблице не создаст, поэтому добавляем отдельно и только
 * если их ещё нет (схема проверяется заново при каждом старте воркера).
 */
async function ensureColumn(db: D1Database, table: string, column: string, definition: string) {
  try {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    if ((info.results || []).some((row) => row.name === column)) return;
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  } catch {
    // Колонка уже есть либо PRAGMA недоступен — на работу это не влияет.
  }
}

export async function ensureSchema() {
  if (initialized) return;
  const { DB } = bindings();
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      project_type TEXT NOT NULL DEFAULT 'business', admin_key TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'waiting', active_presentation_id TEXT,
      current_page INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS presentations (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, student_name TEXT NOT NULL,
      authors TEXT, title TEXT NOT NULL, filename TEXT NOT NULL, object_key TEXT NOT NULL,
      created_at TEXT NOT NULL, FOREIGN KEY(group_id) REFERENCES groups(id)
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY, presentation_id TEXT NOT NULL, voter_name TEXT NOT NULL,
      idea INTEGER NOT NULL, execution INTEGER NOT NULL, delivery INTEGER NOT NULL,
      potential INTEGER NOT NULL, comment TEXT, created_at TEXT NOT NULL,
      UNIQUE(presentation_id, voter_name),
      FOREIGN KEY(presentation_id) REFERENCES presentations(id)
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, upload_id TEXT NOT NULL,
      object_key TEXT NOT NULL, student_name TEXT NOT NULL, authors TEXT,
      title TEXT NOT NULL, filename TEXT NOT NULL, file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL, FOREIGN KEY(group_id) REFERENCES groups(id)
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_presentations_group ON presentations(group_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_votes_presentation ON votes(presentation_id)"),
  ]);
  await ensureColumn(DB, "presentations", "authors", "TEXT");
  await ensureColumn(DB, "upload_sessions", "authors", "TEXT");
  initialized = true;
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init.headers || {}) },
  });
}

export function randomToken(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function groupPayload(code: string) {
  await ensureSchema();
  const { DB } = bindings();
  const group = await DB.prepare(`SELECT id, code, name, project_type, phase,
    active_presentation_id, current_page, created_at FROM groups WHERE code = ?`)
    .bind(code.toUpperCase()).first<Omit<GroupRow, "admin_key">>();
  if (!group) return null;
  const presentations = await DB.prepare(`SELECT p.id, p.group_id, p.student_name,
      p.authors, p.title, p.filename, p.created_at,
      COUNT(v.id) AS vote_count,
      ROUND(AVG((v.idea + v.execution + v.delivery + v.potential) / 4.0), 1) AS score,
      ROUND(AVG(v.idea), 1) AS idea_score,
      ROUND(AVG(v.execution), 1) AS execution_score,
      ROUND(AVG(v.delivery), 1) AS delivery_score,
      ROUND(AVG(v.potential), 1) AS potential_score
    FROM presentations p LEFT JOIN votes v ON v.presentation_id = p.id
    WHERE p.group_id = ? GROUP BY p.id ORDER BY p.created_at ASC`).bind(group.id).all();
  return { group, presentations: presentations.results };
}

/**
 * Удаляет сессию целиком: PDF-файлы из R2, презентации, оценки и саму группу.
 * Возвращает `false`, если сессии с таким кодом уже нет.
 */
export async function deleteGroup(code: string): Promise<boolean> {
  await ensureSchema();
  const { DB, FILES } = bindings();
  const group = await DB.prepare("SELECT id FROM groups WHERE code = ?")
    .bind(code.toUpperCase()).first<{ id: string }>();
  if (!group) return false;

  // Файлы группы лежат под префиксом <group.id>/ — забираем страницами по 1000.
  let cursor: string | undefined;
  do {
    const page = await FILES.list({ prefix: `${group.id}/`, cursor, limit: 1000 });
    const keys = page.objects.map((object) => object.key);
    if (keys.length) await FILES.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  await DB.batch([
    DB.prepare(`DELETE FROM votes WHERE presentation_id IN
      (SELECT id FROM presentations WHERE group_id = ?)`).bind(group.id),
    DB.prepare("DELETE FROM presentations WHERE group_id = ?").bind(group.id),
    DB.prepare("DELETE FROM upload_sessions WHERE group_id = ?").bind(group.id),
    DB.prepare("DELETE FROM groups WHERE id = ?").bind(group.id),
  ]);
  return true;
}
