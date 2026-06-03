import { FileText } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export default function ListingsPage() {
  return (
    <ModulePlaceholder
      icon={FileText}
      emoji="📝"
      title="Listing 助手"
      subtitle="AI 生成与优化标题、卖点、关键词,一键多语言本地化"
      intro="不会写英文 Listing?AI 帮你根据商品卖点生成高转化标题与描述,并做本地化翻译。"
      features={[
        'AI 标题 & 卖点文案生成',
        'TikTok Shop 关键词优化',
        '多语言本地化翻译',
        '主图/卖点合规检查',
        '竞品 Listing 对比参考',
      ]}
      cta={{ href: '/discovery', label: '从选品开始' }}
    />
  );
}
