import { getMe } from "@/lib/api-client";
import { GuideMap } from "./guide-map";
import { GuidePlanForm } from "./plan-form";

export const metadata = { title: "新手指南 · 发现猫" };

/**
 * 新手指南:给对跨境行业不了解的用户快速补认知。
 * 主体是预制的全流程地图(6 步,零 token 瞬开),底部才是 LLM 个性化路线。
 * 游客全程可看;个性化路线与接力派活在各自入口按需弹登录。
 */
export default async function GuidePage() {
  const me = await getMe();
  const workspace = me?.workspace ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16">
      <div className="pt-4 text-center sm:pt-8">
        <h1 className="font-display text-display-sm text-ink">跨境带货，60 秒看懂</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-500">
          从开店到回款一共 6 步。每一步在干什么、大概花多少钱、坑在哪，都在下面；
          标着「发现猫替你干」的步骤，点一下就能直接派活。
        </p>
      </div>

      <GuideMap />

      <GuidePlanForm workspaceId={workspace?.id ?? ""} isGuest={!workspace} />
    </div>
  );
}
