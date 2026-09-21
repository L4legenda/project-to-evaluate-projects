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
  title: string;
  filename: string;
  object_key: string;
  created_at: string;
};

let initialized = false;

export function bindings() {
  return env as unknown as { DB: D1Database; FILES: R2Bucket };
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
      title TEXT NOT NULL, filename TEXT NOT NULL, object_key TEXT NOT NULL,
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
      object_key TEXT NOT NULL, student_name TEXT NOT NULL, title TEXT NOT NULL,
      filename TEXT NOT NULL, file_size INTEGER NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(group_id) REFERENCES groups(id)
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_presentations_group ON presentations(group_id)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_votes_presentation ON votes(presentation_id)"),
  ]);
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
      p.title, p.filename, p.created_at,
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
