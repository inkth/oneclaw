import { apiServer } from "@/lib/api-client";
import { type CategoryOption } from "./FilterBar";

/** 取一级类目筛选项（服务端）。失败返回空数组（筛选栏不渲染类目行）。 */
export async function fetchCategories(region: string): Promise<CategoryOption[]> {
  try {
    const res = await apiServer<{ categories: CategoryOption[] }>(
      `/discover/categories?region=${region}`,
    );
    return res.categories ?? [];
  } catch {
    return [];
  }
}
