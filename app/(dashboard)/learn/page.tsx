import { GraduationCap } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export default function LearnPage() {
  return (
    <ModulePlaceholder
      icon={GraduationCap}
      emoji="🎓"
      title="知识学院"
      subtitle="从 0 到 1 的 TikTok Shop 出海实操教程与 SOP"
      intro="新手必看的开店、选品、达人、合规全流程教程,配合 AI 助手随时答疑。"
      features={[
        '开店入驻全流程指引',
        '选品 / 达人 / 投流 SOP',
        '平台规则与合规要点',
        '爆款案例拆解',
        'AI 导师实时答疑',
      ]}
      cta={{ href: '/dashboard', label: '回到驾驶舱' }}
    />
  );
}
