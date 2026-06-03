import { Play, Eye, Heart, MessageCircle, Bookmark, Video } from "lucide-react";

const videos = [
  {
    id: "01",
    title: "Unboxing 风",
    gradient: "from-rose-400 via-pink-500 to-fuchsia-500",
    emoji: "📦",
    views: "98.3K",
    likes: "12.1K",
  },
  {
    id: "02",
    title: "对比测评",
    gradient: "from-amber-400 via-orange-500 to-rose-500",
    emoji: "⚖️",
    views: "62.4K",
    likes: "7.8K",
  },
  {
    id: "03",
    title: "生活场景",
    gradient: "from-emerald-400 via-teal-500 to-cyan-500",
    emoji: "🌿",
    views: "44.7K",
    likes: "5.2K",
  },
  {
    id: "04",
    title: "Before/After",
    gradient: "from-indigo-400 via-violet-500 to-purple-500",
    emoji: "✨",
    views: "31.0K",
    likes: "4.4K",
  },
];

export function ContentCreation() {
  return (
    <section id="content" className="relative py-24 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
          <div className="lg:col-span-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
              <Video className="h-3 w-3" />
              创意总监 Agent
            </div>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              一个产品，
              <br />
              四套差异化短视频
            </h2>
            <p className="mt-4 text-zinc-600 leading-relaxed">
              创意总监根据选品的卖点、目标受众和平台调性，自动生成 4 套 9:16 竖屏短视频脚本与素材，
              覆盖开箱、测评、场景、对比四种主流叙事，每条平均 15 秒，可一键导出剪映 / CapCut 工程。
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <Stat value="98.3K" label="平均播放" />
              <Stat value="1.2K" label="收藏数" />
              <Stat value="$4.2K" label="带货 GMV" />
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {videos.map((v) => (
                <VideoTile key={v.id} {...v} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white px-3 py-3">
      <div className="text-lg font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

function VideoTile({
  id,
  title,
  gradient,
  emoji,
  views,
  likes,
}: {
  id: string;
  title: string;
  gradient: string;
  emoji: string;
  views: string;
  likes: string;
}) {
  return (
    <div className="group relative aspect-[9/14] overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/60" />

      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[10px] font-mono font-semibold text-white">
        {id}
      </div>

      <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-zinc-900">
        9:16 · 15s
      </div>

      <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-90 group-hover:scale-110 transition-transform">
        {emoji}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 text-white">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-2 flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {views}
          </div>
          <div className="flex items-center gap-1">
            <Heart className="h-3 w-3 fill-current" />
            {likes}
          </div>
        </div>
      </div>

      <button className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-zinc-900 shadow-xl">
          <Play className="h-5 w-5 fill-current ml-0.5" />
        </div>
      </button>
    </div>
  );
}
