"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiBrowser } from "@/lib/api-browser";
import { LoginPromptModal } from "@/components/LoginPromptModal";
import { Button } from "@/components/ui/Button";
import { Star, Loader2 } from "lucide-react";

export type FavSnapshot = { name: string; cover: string; subtitle: string; metric: string };

/** 店铺/达人/视频收藏星标按钮(游客点击弹登录)。商品收藏走单独的 interactions 接口。 */
export function FavoriteButton({
  kind,
  externalId,
  region,
  workspaceId,
  isGuest,
  initialStarred,
  snapshot,
  callbackUrl,
}: {
  kind: "seller" | "influencer" | "video";
  externalId: string;
  region: string;
  workspaceId: string;
  isGuest: boolean;
  initialStarred: boolean;
  snapshot: FavSnapshot;
  callbackUrl: string;
}) {
  const [starred, setStarred] = useState(initialStarred);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  async function toggle() {
    if (busy) return;
    if (isGuest) {
      setLoginOpen(true);
      return;
    }
    const next = !starred;
    setStarred(next);
    setBusy(true);
    try {
      await apiBrowser(`/workspaces/${workspaceId}/discover/favorites`, {
        method: "POST",
        body: JSON.stringify({ kind, externalId, region, starred: next, snapshot }),
      });
      if (next) toast.success("已收藏");
    } catch {
      setStarred(!next);
      toast.error("操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {loginOpen && (
        <LoginPromptModal
          onClose={() => setLoginOpen(false)}
          callbackUrl={callbackUrl}
          title="登录后即可收藏"
          desc="收藏店铺、达人、视频需要账号。详情随便看,登录后一键收藏。"
        />
      )}
      <Button variant="secondary" size="sm" onClick={toggle} disabled={busy}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Star className={`h-3.5 w-3.5 ${starred ? "fill-amber-400 text-amber-400" : ""}`} />
        )}
        {starred ? "已收藏" : "收藏"}
      </Button>
    </>
  );
}
