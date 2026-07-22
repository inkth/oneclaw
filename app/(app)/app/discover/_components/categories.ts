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

/** 取二级/三级类目筛选项（level=子级层级 2|3）。父级未选或失败返回空数组（不渲染该级行）。 */
export async function fetchCategoryChildren(
  region: string,
  parentId: string | null,
  level: 2 | 3,
): Promise<CategoryOption[]> {
  if (!parentId) return [];
  try {
    const res = await apiServer<{ categories: CategoryOption[] }>(
      `/discover/categories/children?region=${region}&parent_id=${parentId}&level=${level}`,
    );
    return res.categories ?? [];
  } catch {
    return [];
  }
}
