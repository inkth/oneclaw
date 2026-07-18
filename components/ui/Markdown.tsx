import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * AI 正文的 Markdown 渲染：只开放模型真会用到的窄子集（标题/列表/强调/表格/代码/引用/链接）。
 *
 * 安全口径：内容来自 LLM，不接 rehype-raw —— 源文里的裸 HTML 一律不渲染；
 * 链接走 react-markdown 默认的 urlTransform（拦 javascript: 等协议）并强制 noopener。
 * 图片/HTML 不在白名单内，避免正文里被塞外链图打点。
 *
 * 排版口径：字号继承外层（text-sm / text-xs 都能用），内部只用 em 相对尺寸，
 * 保证同一个组件在会话气泡和复盘卡里都不跑版。
 */

/** 白名单：不在此列的节点（img/html/input 等）整体丢弃。 */
const ALLOWED = [
  "p", "br", "strong", "em", "del",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "code", "pre",
  "blockquote", "hr", "a",
  "table", "thead", "tbody", "tr", "th", "td",
];

const heading = "mt-4 mb-1.5 font-semibold text-ink first:mt-0";

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    // leading-relaxed 必须排在 className 之后：Tailwind 4 的 text-sm/text-xs 自带 line-height，
    // twMerge 会把排在前面的 leading-* 判成被覆盖而删掉，行距就塌回紧排。
    <div className={cn("break-words", className, "leading-relaxed")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        allowedElements={ALLOWED}
        // 被拦下的节点（如 img）保留其文字子节点，不让整段内容凭空消失
        unwrapDisallowed
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          // 模型给的层级不可靠（有的从 # 起、有的从 ### 起），统一压成两档视觉
          h1: ({ children }) => <h3 className={cn(heading, "text-[1.05em]")}>{children}</h3>,
          h2: ({ children }) => <h3 className={cn(heading, "text-[1.05em]")}>{children}</h3>,
          h3: ({ children }) => <h4 className={heading}>{children}</h4>,
          h4: ({ children }) => <h4 className={heading}>{children}</h4>,
          h5: ({ children }) => <h4 className={heading}>{children}</h4>,
          h6: ({ children }) => <h4 className={heading}>{children}</h4>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-[1.35em] first:mt-0 last:mb-0 marker:text-zinc-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-[1.35em] first:mt-0 last:mb-0 marker:text-zinc-400">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          del: ({ children }) => <del className="text-zinc-400">{children}</del>,
          hr: () => <hr className="my-3 border-[var(--dk-stroke-divider)]" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[var(--dk-stroke-border)] pl-3 text-zinc-500">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600"
            >
              {children}
            </a>
          ),
          // 围栏代码块由 pre 接管容器样式，这里只处理行内 code
          code: ({ children, className: cls }) =>
            cls?.startsWith("language-") ? (
              <code className="block">{children}</code>
            ) : (
              <code className="rounded border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] px-1 py-px text-[0.9em] text-zinc-700">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-[var(--dk-stroke-border)] bg-[var(--dk-surface-2)] p-3 text-[0.9em] leading-relaxed text-zinc-700">
              {children}
            </pre>
          ),
          // 表格在窄气泡里必然溢出：容器自带横滚，不挤压正文宽度
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--dk-stroke-border)]">
              <table className="w-full border-collapse text-[0.92em]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-[var(--dk-stroke-divider)] bg-[var(--dk-surface-2)] text-[var(--dk-content-secondary)]">
              {children}
            </thead>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-[var(--dk-stroke-divider)] last:border-0">{children}</tr>
          ),
          th: ({ children, style }) => (
            <th style={style} className="whitespace-nowrap px-3 py-2 text-left font-[550]">
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td style={style} className="px-3 py-2 align-top">
              {children}
            </td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
