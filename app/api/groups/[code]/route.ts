import { isAdminAuthenticated } from "@/app/lib/auth";
import { bindings, deleteGroup, ensureSchema, groupPayload, json } from "@/app/lib/store";

type Context = { params: Promise<{ code: string }> };

export async function GET(_: Request, context: Context) {
  const { code } = await context.params;
  const payload = await groupPayload(code);
  return payload ? json(payload) : json({ error: "Группа не найдена" }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const body = (await request.json()) as { adminKey?: string; phase?: string; presentationId?: string | null; page?: number };
  const { DB } = bindings();
  const group = await DB.prepare("SELECT id, admin_key FROM groups WHERE code = ?").bind(code.toUpperCase()).first<{ id: string; admin_key: string }>();
  if (!group || group.admin_key !== body.adminKey) return json({ error: "Нет доступа" }, { status: 403 });
  const phase = ["waiting", "presenting", "voting", "results"].includes(body.phase || "") ? body.phase : "waiting";
  const page = Math.max(1, Math.floor(body.page || 1));
  await DB.prepare("UPDATE groups SET phase = ?, active_presentation_id = ?, current_page = ? WHERE id = ?")
    .bind(phase, body.presentationId || null, page, group.id).run();
  return json({ ok: true });
}

/**
 * Удаление сессии вместе с презентациями, оценками и PDF-файлами.
 * Доступ — по cookie админ-панели или по adminKey сессии (он лежит в ссылке
 * управления, которую панель хранит в браузере преподавателя).
 */
export async function DELETE(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { adminKey?: string };
  const url = new URL(request.url);
  const adminKey = body.adminKey?.trim() || url.searchParams.get("key")?.trim() || "";
  const { DB } = bindings();
  const group = await DB.prepare("SELECT id, admin_key FROM groups WHERE code = ?")
    .bind(code.toUpperCase()).first<{ id: string; admin_key: string }>();
  if (!group) return json({ ok: true, deleted: false });
  const allowed = (await isAdminAuthenticated()) || (adminKey.length > 0 && adminKey === group.admin_key);
  if (!allowed) return json({ error: "Нет доступа" }, { status: 403 });
  await deleteGroup(code);
  return json({ ok: true, deleted: true });
}
