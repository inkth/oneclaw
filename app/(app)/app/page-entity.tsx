"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * 页面实体上报：详情页（商品/达人/店铺/视频/自建商品）挂载时上报当前实体，
 * FloatingMascot 据此把「当前看到的 XX」换成真实名字，并在可行处带结构化参数派活。
 * React context 不进 Server Components，Provider 由 server layout 包在 children 外层。
 */
export type PageEntity = {
  kind: "discover-product" | "discover-influencer" | "discover-seller" | "discover-video" | "my-product";
  id: string;
  name: string;
  /** 自建商品 id：composer 结构化消费（DIRECTOR/LISTING 注入真实商品数据） */
  productId?: string;
  /** 上报时所在路由；消费方以 pathname 匹配判定是否仍有效 */
  path: string;
};

type Ctx = {
  entity: PageEntity | null;
  setEntity: (e: PageEntity) => void;
};

const PageEntityContext = createContext<Ctx>({ entity: null, setEntity: () => {} });

export function PageEntityProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<PageEntity | null>(null);
  return (
    <PageEntityContext.Provider value={{ entity, setEntity }}>
      {children}
    </PageEntityContext.Provider>
  );
}

/** 取当前路由的实体；离开上报路由后自动失效（按 pathname 匹配，无需清理）。 */
export function usePageEntity(): PageEntity | null {
  const { entity } = useContext(PageEntityContext);
  const pathname = usePathname();
  return entity && entity.path === pathname ? entity : null;
}

/**
 * 详情页调用：挂载/字段变化时上报当前实体。
 * 故意不在卸载时清空——hydration/StrictMode 下被丢弃实例的 cleanup 可能晚于
 * 新实例的 set 执行而把实体清掉；改为消费方按 pathname 判定有效性。
 */
export function useReportPageEntity(entity: Omit<PageEntity, "path">) {
  const { setEntity } = useContext(PageEntityContext);
  const pathname = usePathname();
  const { kind, id, name, productId } = entity;
  useEffect(() => {
    setEntity({ kind, id, name, productId, path: pathname });
  }, [setEntity, kind, id, name, productId, pathname]);
}
