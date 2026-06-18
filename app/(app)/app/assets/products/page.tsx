import { redirect } from "next/navigation";

// 「选品库」已并入「收藏」。此路由退役,旧链接重定向到收藏页(商品 tab)。
export default function ProductsPage() {
  redirect("/app/discover/favorites");
}
