"use client";

import { useEffect, useState } from "react";
import { apiBrowser } from "@/lib/api-browser";

export type PersonaOption = {
  id: string;
  name: string;
  isPreset: boolean;
  avatarUrl?: string | null;
  style?: string | null;
};

/**
 * 出镜人设列表（预置数字人 + 自有模特），创作页 composer 与任务流确认出片共用。
 * enabled=false 时不发请求（用于懒加载：Popover 首次展开才拉）。
 */
export function usePersonas(workspaceId: string, enabled = true): PersonaOption[] | null {
  const [options, setOptions] = useState<PersonaOption[] | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceId || options !== null) return;
    let alive = true;
    apiBrowser<{ models: PersonaOption[] }>(`/workspaces/${workspaceId}/models`)
      .then((d) => {
        if (alive) setOptions(d.models ?? []);
      })
      .catch(() => {
        if (alive) setOptions([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, enabled]);

  return options;
}
