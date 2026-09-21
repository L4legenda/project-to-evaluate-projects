import { isAdminAuthenticated } from "@/app/lib/auth";
import { bindings, ensureSchema, json, randomToken } from "@/app/lib/store";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return json({ error: "Требуется вход в админ-панель" }, { status: 401 });
  }
  await ensureSchema();
  const body = (await request.json()) as { name?: string; projectType?: string };
  const name = body.name?.trim();
  if (!name) return json({ error: "Введите название сессии" }, { status: 400 });
  const { DB } = bindings();
  const id = crypto.randomUUID();
  const adminKey = randomToken(20);
  let code = randomToken(6);
  for (let i = 0; i < 4; i++) {
    const exists = await DB.prepare("SELECT id FROM groups WHERE code = ?").bind(code).first();
    if (!exists) break;
    code = randomToken(6);
  }
  await DB.prepare("INSERT INTO groups (id, code, name, project_type, admin_key, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, code, name, body.projectType === "game" ? "game" : "business", adminKey, new Date().toISOString()).run();
  return json({ code, adminKey });
}
