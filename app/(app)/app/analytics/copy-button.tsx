"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** 复制 Gemini Prompt 模板的小按钮。复制成功后短暂切换为「已复制」。 */
export function CopyButton({
  text,
  label = "复制提示词",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("已复制，去 Gemini 粘贴并上传报表即可");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  }

  return (
    <button
      onClick={onCopy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        copied
          ? "bg-emerald-50 text-emerald-700"
          : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
        className
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "已复制" : label}
    </button>
  );
}
