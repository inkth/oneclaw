"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// useWarmingRefresh:后端读路径本地化后,冷数据会返回当前库存 + warming=true(表示后台正在补全)。
// 此时做有上限的软刷新(router.refresh 重跑服务端取数),等后台落库后自动呈现,无需用户手动刷新。
// 数据落库后 warming 转 false、停刷;补不到(如 EchoTik 故障)也最多刷 maxTries 次后罢手,不死循环。
export function useWarmingRefresh(warming: boolean | undefined, delayMs = 1500, maxTries = 3) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    if (!warming) {
      tries.current = 0;
      return;
    }
    if (tries.current >= maxTries) return;
    const t = setTimeout(() => {
      tries.current += 1;
      router.refresh();
    }, delayMs);
    return () => clearTimeout(t);
  }, [warming, delayMs, maxTries, router]);
}
