/**
 * Shared navigation source — the platform 板块 map.
 *
 * Single source of truth consumed by both the sidebar and the dashboard
 * module tiles, so the two never drift. Grouped along the TikTok Shop 经营全链路.
 */

import {
  Home,
  Search,
  Users,
  Package,
  FileText,
  Truck,
  BarChart3,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Page exists but feature is still 占位/预览. */
  beta?: boolean;
  /** One-line description for dashboard tiles. */
  desc?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '经营驾驶舱',
    items: [
      { href: '/dashboard', label: '驾驶舱首页', icon: Home, desc: '全链路概览与快速开始' },
    ],
  },
  {
    title: '选品',
    items: [
      { href: '/discovery', label: '智能选品', icon: Search, desc: 'TikTok 热销榜 + AI 选品诊断' },
    ],
  },
  {
    title: '达人营销',
    items: [
      { href: '/influencers', label: '达人合作', icon: Users, desc: '找带货达人 + AI 邀约文案' },
    ],
  },
  {
    title: '货源',
    items: [
      { href: '/sourcing', label: '货源对接', icon: Package, beta: true, desc: '一键找货 + 成本测算' },
    ],
  },
  {
    title: '商品 & 内容',
    items: [
      { href: '/listings', label: 'Listing 助手', icon: FileText, beta: true, desc: 'AI Listing + 内容脚本' },
    ],
  },
  {
    title: '物流',
    items: [
      { href: '/fulfillment', label: '物流履约', icon: Truck, beta: true, desc: '物流对比 + 关税估算' },
    ],
  },
  {
    title: '数据经营',
    items: [
      { href: '/analytics', label: '数据看板', icon: BarChart3, beta: true, desc: '竞品监控 + AI 周报' },
    ],
  },
  {
    title: '学院',
    items: [
      { href: '/learn', label: '知识学院', icon: GraduationCap, beta: true, desc: '实操教程 + AI 导师' },
    ],
  },
];
