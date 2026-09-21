import { bindings, ensureSchema, json } from "@/app/lib/store";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Context) {
  await ensureSchema();
  const { code } = await context.params;
  const b = (await request.json()) as Record<string, unknown>;
  const voterName = String(b.voterName || "").trim();
  const presentationId = String(b.presentationId || "");
  const nums = [b.idea, b.execution, b.delivery, b.potential].map(Number);
  if (!voterName || !presentationId || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) return json({ error: "Заполните все оценки от 1 до 10" }, { status: 400 });
  const { DB } = bindings();
  const valid = await DB.prepare("SELECT p.id FROM presentations p JOIN groups g ON g.id = p.group_id WHERE p.id = ? AND g.code = ? AND g.phase = 'voting'")
    .bind(presentationId, code.toUpperCase()).first();
  if (!valid) return json({ error: "Голосование сейчас недоступно" }, { status: 400 });
  try {
    await DB.prepare("INSERT INTO votes (id, presentation_id, voter_name, idea, execution, delivery, potential, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), presentationId, voterName, ...nums, String(b.comment || "").trim().slice(0, 500), new Date().toISOString()).run();
  } catch {
    return json({ error: "Вы уже оценили эту презентацию" }, { status: 409 });
  }
  return json({ ok: true });
}
