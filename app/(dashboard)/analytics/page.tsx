import { BarChart3, TrendingUp, Users, Package } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">数据看板</h1>
        <p className="text-sm text-zinc-500 mt-1">
          监控竞品表现、追踪达人 ROI、分析经营数据
        </p>
      </header>

      {/* Placeholder Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Package} label="收藏商品" value="0" sub="件" />
        <StatCard icon={Users} label="合作达人" value="0" sub="位" />
        <StatCard icon={TrendingUp} label="GMV 追踪" value="$0" sub="累计" />
        <StatCard icon={BarChart3} label="数据洞察" value="0" sub="条" />
      </div>

      {/* Coming Soon */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-12 text-center">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-lg font-semibold mb-2">数据看板即将上线</h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          完成注册并开始选品后，这里将展示你的竞品监控数据、达人合作 ROI、以及个性化的运营建议
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-zinc-400">
          <Feature label="竞品价格监控" />
          <Feature label="达人 ROI 追踪" />
          <Feature label="销量趋势对比" />
          <Feature label="AI 周报生成" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-zinc-400" />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] text-zinc-400">{sub}</div>
    </div>
  );
}

function Feature({ label }: { label: string }) {
  return (
    <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
      {label}
    </span>
  );
}
