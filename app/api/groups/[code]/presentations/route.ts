import { bindings, ensureSchema, json } from "@/app/lib/store";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const data = await request.formData();
  const studentName = String(data.get("studentName") || "").trim();
  const title = String(data.get("title") || "").trim();
  const file = data.get("file");
  if (!studentName || !(file instanceof File)) return json({ error: "Укажите ФИО и выберите PDF" }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return json({ error: "Можно загрузить только PDF" }, { status: 400 });
  if (file.size > 30 * 1024 * 1024) return json({ error: "Файл должен быть не больше 30 МБ" }, { status: 400 });
  const { DB, FILES } = bindings();
  const group = await DB.prepare("SELECT id FROM groups WHERE code = ?").bind(code.toUpperCase()).first<{ id: string }>();
  if (!group) return json({ error: "Группа не найдена" }, { status: 404 });
  const id = crypto.randomUUID();
  const objectKey = `${group.id}/${id}.pdf`;
  await FILES.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: "application/pdf" } });
  await DB.prepare("INSERT INTO presentations (id, group_id, student_name, title, filename, object_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, group.id, studentName, title || file.name.replace(/\.pdf$/i, ""), file.name, objectKey, new Date().toISOString()).run();
  return json({ ok: true, id });
}
