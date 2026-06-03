import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  emoji: string;
  title: string;
  subtitle: string;
  intro: string;
  features: string[];
  cta?: { href: string; label: string };
}

/** Structured "即将上线" page for not-yet-functional modules. Shows the planned
 *  feature list (so the section reads as a roadmap, not a dead end) plus a CTA
 *  back into a live module. Mirrors the analytics placeholder visual style. */
export function ModulePlaceholder({ icon: Icon, emoji, title, subtitle, intro, features, cta }: Props) {
  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-8 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
          <Icon size={20} className="text-zinc-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
        </div>
      </header>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-10 text-center">
        <div className="text-5xl mb-4">{emoji}</div>
        <h2 className="text-lg font-semibold mb-2">{title}即将上线</h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">{intro}</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto text-left">
          {features.map(f => (
            <div
              key={f}
              className="flex items-center gap-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400"
            >
              <span className="text-orange-500">●</span>
              {f}
            </div>
          ))}
        </div>

        {cta && (
          <Link
            href={cta.href}
            className="mt-8 inline-flex px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black hover:opacity-90"
          >
            {cta.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
