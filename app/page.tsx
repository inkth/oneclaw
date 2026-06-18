import { redirect } from "next/navigation";

// 私域/社群为主:前门直接进工作台(进来即产品)。
// 营销落地页搬到 /intro,需要给陌生人讲「是什么」时发那条链接。
export default function Home() {
  redirect("/app");
}
