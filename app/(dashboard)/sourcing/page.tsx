import { Package } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export default function SourcingPage() {
  return (
    <ModulePlaceholder
      icon={Package}
      emoji="📦"
      title="货源对接"
      subtitle="从 1688 / 工厂一键找货,对比成本与起订量"
      intro="选好商品后,这里帮你快速对接国内货源、对比报价与利润空间,告别盲目囤货。"
      features={[
        '图片/关键词找同款货源',
        '1688 报价与起订量对比',
        '到手成本 & 利润测算',
        'AI 供应商风险提示',
        '货源收藏与备注管理',
      ]}
      cta={{ href: '/discovery', label: '先去选品' }}
    />
  );
}
