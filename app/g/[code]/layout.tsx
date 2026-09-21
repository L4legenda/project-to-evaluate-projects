import type { Metadata } from "next";
import { groupPayload } from "@/app/lib/store";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const payload = await groupPayload(code);
  const title = payload ? `${payload.group.name} · Pitchroom` : "Группа не найдена · Pitchroom";
  const description = payload
    ? `Загрузите презентацию и участвуйте в оценивании. Код группы: ${payload.group.code}.`
    : "Проверьте код группы и попробуйте снова.";
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default function GroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
