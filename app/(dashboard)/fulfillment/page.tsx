import { Truck } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export default function FulfillmentPage() {
  return (
    <ModulePlaceholder
      icon={Truck}
      emoji="🚚"
      title="物流履约"
      subtitle="对比物流方案、估算时效与关税,跟踪发货履约"
      intro="从国内仓到海外买家,这里帮你选最优物流方案、估算时效与税费,保障好评率。"
      features={[
        '物流渠道时效 & 价格对比',
        '关税 / 税费估算',
        '海外仓与备货建议',
        '发货与履约跟踪',
        'AI 物流方案推荐',
      ]}
      cta={{ href: '/analytics', label: '查看数据看板' }}
    />
  );
}
