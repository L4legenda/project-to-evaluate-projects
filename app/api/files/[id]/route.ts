import { bindings, ensureSchema } from "@/app/lib/store";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  await ensureSchema();
  const { id } = await context.params;
  const { DB, FILES } = bindings();
  const row = await DB.prepare("SELECT object_key, filename FROM presentations WHERE id = ?").bind(id).first<{ object_key: string; filename: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const object = await FILES.get(row.object_key, { range: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Accept-Ranges", "bytes");
  if (object.range) {
    const r = object.range as { offset: number; length: number };
    headers.set("Content-Range", `bytes ${r.offset}-${r.offset + r.length - 1}/${object.size}`);
  }
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}
