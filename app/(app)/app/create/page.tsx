import { redirect } from "next/navigation";

// 「创作」已并入工作台(/app)：四个 Agent 同处一框。
// 旧链接(收藏接力 / 书签)带参重定向过去，保留 agent / prompt / productId。
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["agent", "prompt", "productId"] as const) {
    if (sp[k]) qs.set(k, sp[k]!);
  }
  const q = qs.toString();
  redirect(q ? `/app?${q}` : "/app");
}
