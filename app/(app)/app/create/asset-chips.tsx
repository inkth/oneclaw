"use client";

import { useState } from "react";
import { Globe, Plus, SlidersHorizontal, X } from "lucide-react";
import { Popover, ToolbarButton } from "@/components/ui/Popover";
import { REGIONS } from "../discover/_components/regions";
import type { ComposerKind } from "../agent-composer";
import { AssetPickerModal } from "./asset-picker-modal";

/**
 * 做视频「设置」里可调的三项:
 * region 目标市场(决定口播母语,默认美国 US,总是一个明确市场——不做「自动跟随商品」)、
 * duration=null 时由 AI 自选时长、aspect 默认竖屏 9:16。
 * 市场→语言权威映射在 Go region_lang.go。
 */
export type VideoSettings = {
  region: string;
  duration: number | null;
  aspect: string;
};

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  region: "US",
  duration: null,
  aspect: "9:16",
};

// 时长候选:夹在 Seedance 2.0 支持的 4-15s 内,留「自动」让 AI 按脚本配速。
const DURATION_OPTIONS = [8, 12, 15];
// 画幅候选:竖屏优先(TikTok 主场景),保留横屏/方形。
const ASPECT_OPTIONS = ["9:16", "16:9", "1:1"];

/**
 * 创作 composer 的工具链:资产选择收成单个「+ 添加」按钮,点开弹出 4 tab 弹窗
 * (上传资产 / AI 生成 / 商品 / 模特)在里面挑;选中值由 Workbench 持有,派活成功即清空。
 * 「设置」(短视频出片市场/时长/比例)仍是独立 chip。游客点击交给 gate 弹登录。
 */
export function AssetChips({
  workspaceId,
  activeAgent,
  productId,
  onProductChange,
  personaId,
  onPersonaChange,
  materialId,
  onMaterialChange,
  videoSettings,
  onVideoSettingsChange,
  gate,
}: {
  workspaceId: string;
  activeAgent: ComposerKind;
  productId: string | null;
  onProductChange: (id: string | null) => void;
  personaId: string | null;
  onPersonaChange: (id: string | null) => void;
  materialId: string | null;
  onMaterialChange: (id: string | null) => void;
  /** 出片设置:目标市场(定口播语言)/ 时长 / 比例,仅短视频(DIRECTOR)用。 */
  videoSettings: VideoSettings;
  onVideoSettingsChange: (next: VideoSettings) => void;
  /** 游客拦截:返回 true 表示已弹登录,选择器不展开。 */
  gate: () => boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // 资产入口仅创作类 Agent(后端只在 DIRECTOR/LISTING 消费这些 ID)。
  const showAssets = activeAgent === "DIRECTOR" || activeAgent === "LISTING";
  const selectedCount = (productId ? 1 : 0) + (personaId ? 1 : 0) + (materialId ? 1 : 0);

  return (
    <>
      {/* 资产:合并为单个「+ 添加」,点开弹窗选 商品 / 模特 / 上传 / AI 生成 */}
      {showAssets && (
        <button
          type="button"
          onClick={() => {
            if (gate()) return;
            setPickerOpen(true);
          }}
        >
          <ToolbarButton
            icon={Plus}
            label="添加"
            open={pickerOpen}
            active={selectedCount > 0}
            badge={selectedCount > 0 ? selectedCount : undefined}
          />
        </button>
      )}

      {/* 出片设置:目标市场(定口播语言)/ 时长 / 比例 —— 仅短视频,不设就全交给 AI/后端 */}
      {activeAgent === "DIRECTOR" && (
        <Popover
          align="start"
          panelClassName="w-72"
          trigger={({ open }) => (
            <ToolbarButton
              icon={SlidersHorizontal}
              label={settingsSummary(videoSettings)}
              open={open}
              active={isVideoSettingsCustomized(videoSettings)}
            />
          )}
        >
          {() => (
            <div className="space-y-3">
              {/* 目标市场:决定口播母语(权威映射在后端 region_lang.go) */}
              <div>
                <div className="mb-1.5 flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-zinc-500">
                  <Globe className="h-3 w-3" />
                  目标市场 · 定口播语言
                </div>
                <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto">
                  {REGIONS.map((r) => (
                    <OptionButton
                      key={r.code}
                      className="w-full"
                      active={videoSettings.region === r.code}
                      onClick={() => onVideoSettingsChange({ ...videoSettings, region: r.code })}
                    >
                      <span className="truncate">
                        {r.flag} {r.cn}
                        <span className="text-zinc-400"> · {r.lang}</span>
                      </span>
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* 时长 */}
              <div>
                <div className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-zinc-500">
                  时长
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <OptionButton
                    active={videoSettings.duration === null}
                    onClick={() => onVideoSettingsChange({ ...videoSettings, duration: null })}
                  >
                    自动
                  </OptionButton>
                  {DURATION_OPTIONS.map((d) => (
                    <OptionButton
                      key={d}
                      active={videoSettings.duration === d}
                      onClick={() => onVideoSettingsChange({ ...videoSettings, duration: d })}
                    >
                      {d}s
                    </OptionButton>
                  ))}
                </div>
              </div>

              {/* 比例 */}
              <div>
                <div className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-zinc-500">
                  比例
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_OPTIONS.map((a) => (
                    <OptionButton
                      key={a}
                      active={videoSettings.aspect === a}
                      onClick={() => onVideoSettingsChange({ ...videoSettings, aspect: a })}
                    >
                      {a}
                    </OptionButton>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Popover>
      )}

      {/* 已选清除:一个 chip 一键全清,避免误带上一次的资产 */}
      {(productId || personaId || materialId) && (
        <button
          onClick={() => {
            onProductChange(null);
            onPersonaChange(null);
            onMaterialChange(null);
          }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-2xs text-zinc-400 transition-colors hover:text-zinc-600"
          title="清除已选资产"
        >
          <X className="h-3 w-3" />
          清除
        </button>
      )}

      {pickerOpen && (
        <AssetPickerModal
          workspaceId={workspaceId}
          activeAgent={activeAgent}
          productId={productId}
          onProductChange={onProductChange}
          personaId={personaId}
          onPersonaChange={onPersonaChange}
          materialId={materialId}
          onMaterialChange={onMaterialChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// 工具栏「设置」chip 的标签:直接显示当前三项配置(默认值也照常显示,不用泛泛的「设置」)。
// 例:默认「美国 · 自动 · 9:16」;选过则「日本 · 15s · 1:1」。
function settingsSummary(v: VideoSettings): string {
  const market = REGIONS.find((r) => r.code === v.region)?.cn ?? v.region;
  const dur = v.duration ? `${v.duration}s` : "自动";
  return `${market} · ${dur} · ${v.aspect}`;
}

// 是否已偏离默认(美国/自动/9:16):用于给 chip 加高亮,提示「已自定义」。
function isVideoSettingsCustomized(v: VideoSettings): boolean {
  return (
    v.region !== DEFAULT_VIDEO_SETTINGS.region ||
    v.duration !== DEFAULT_VIDEO_SETTINGS.duration ||
    v.aspect !== DEFAULT_VIDEO_SETTINGS.aspect
  );
}

/** 设置面板里的单选小按钮:选中 brand 浅底描边,未选灰描边。 */
function OptionButton({
  active,
  onClick,
  className = "",
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center overflow-hidden rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
        active
          ? "border-brand-500 bg-brand-50/60 font-medium text-brand-700"
          : "border-zinc-200/80 text-zinc-600 hover:border-zinc-300"
      } ${className}`}
    >
      {children}
    </button>
  );
}
