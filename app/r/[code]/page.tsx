import { InviteRedirect } from "./invite-redirect";

export const metadata = { title: "邀请注册 · 发现猫" };

/** 代理商邀请落地页 /r/CODE：记住邀请码后转登录页。落地即注册入口，归因绑定在首次登录时完成。 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <InviteRedirect code={code} />;
}
