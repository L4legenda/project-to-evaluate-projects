import { bindings, ensureSchema, json } from "@/app/lib/store";

type Context = { params: Promise<{ code: string }> };
type UploadSession = {
  id: string; group_id: string; upload_id: string; object_key: string;
  student_name: string; title: string; filename: string; file_size: number;
};
const CHUNK_SIZE = 6 * 1024 * 1024;

async function findSession(code: string, id: string) {
  const { DB } = bindings();
  return DB.prepare(`SELECT u.* FROM upload_sessions u JOIN groups g ON g.id = u.group_id
    WHERE u.id = ? AND g.code = ?`).bind(id, code.toUpperCase()).first<UploadSession>();
}

export async function POST(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const body = (await request.json()) as { studentName?: string; title?: string; filename?: string; size?: number; type?: string };
  const studentName = body.studentName?.trim();
  const filename = body.filename?.trim();
  const size = Number(body.size || 0);
  if (!studentName || !filename) return json({ error: "Укажите ФИО и выберите PDF" }, { status: 400 });
  if (body.type !== "application/pdf" && !filename.toLowerCase().endsWith(".pdf")) return json({ error: "Можно загрузить только PDF" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0 || size > 30 * 1024 * 1024) return json({ error: "Файл должен быть не больше 30 МБ" }, { status: 400 });
  const { DB, FILES } = bindings();
  const group = await DB.prepare("SELECT id FROM groups WHERE code = ?").bind(code.toUpperCase()).first<{ id: string }>();
  if (!group) return json({ error: "Группа не найдена" }, { status: 404 });
  const id = crypto.randomUUID();
  const objectKey = `${group.id}/${id}.pdf`;
  const upload = await FILES.createMultipartUpload(objectKey, { httpMetadata: { contentType: "application/pdf" } });
  await DB.prepare(`INSERT INTO upload_sessions
    (id, group_id, upload_id, object_key, student_name, title, filename, file_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, group.id, upload.uploadId, objectKey, studentName, body.title?.trim() || filename.replace(/\.pdf$/i, ""), filename, size, new Date().toISOString()).run();
  return json({ id });
}

export async function PUT(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const partNumber = Number(url.searchParams.get("part"));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) return json({ error: "Некорректная часть файла" }, { status: 400 });
  const session = await findSession(code, id);
  if (!session) return json({ error: "Сессия загрузки не найдена" }, { status: 404 });
  const chunk = await request.arrayBuffer();
  const expectedParts = Math.ceil(session.file_size / CHUNK_SIZE);
  const expectedLength = partNumber === expectedParts ? session.file_size - CHUNK_SIZE * (expectedParts - 1) : CHUNK_SIZE;
  if (partNumber > expectedParts || chunk.byteLength !== expectedLength) return json({ error: "Некорректный размер части" }, { status: 400 });
  const upload = bindings().FILES.resumeMultipartUpload(session.object_key, session.upload_id);
  const part = await upload.uploadPart(partNumber, chunk);
  return json({ partNumber: part.partNumber, etag: part.etag });
}

export async function PATCH(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const body = (await request.json()) as { id?: string; parts?: R2UploadedPart[] };
  const session = await findSession(code, body.id || "");
  if (!session || !body.parts?.length) return json({ error: "Загрузка не найдена" }, { status: 404 });
  const expectedParts = Math.ceil(session.file_size / CHUNK_SIZE);
  if (body.parts.length !== expectedParts || body.parts.some((part, index) => part.partNumber !== index + 1)) return json({ error: "Переданы не все части файла" }, { status: 400 });
  const { DB, FILES } = bindings();
  const upload = FILES.resumeMultipartUpload(session.object_key, session.upload_id);
  await upload.complete(body.parts);
  await DB.batch([
    DB.prepare(`INSERT INTO presentations (id, group_id, student_name, title, filename, object_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(session.id, session.group_id, session.student_name, session.title, session.filename, session.object_key, new Date().toISOString()),
    DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(session.id),
  ]);
  return json({ ok: true, id: session.id });
}

export async function DELETE(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const id = new URL(request.url).searchParams.get("id") || "";
  const session = await findSession(code, id);
  if (!session) return json({ ok: true });
  const { DB, FILES } = bindings();
  await FILES.resumeMultipartUpload(session.object_key, session.upload_id).abort();
  await DB.prepare("DELETE FROM upload_sessions WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
