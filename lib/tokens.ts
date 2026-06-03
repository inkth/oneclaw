import crypto from "node:crypto";

/**
 * 生成密码重置 / 邮箱验证 token：随机 URL-safe 32 字节字符串。
 * 数据库存的是 sha256(token) hex，从不存原文，泄露 DB 不会泄露 token。
 */
export function generateToken(): { plain: string; hash: string } {
  const plain = crypto.randomBytes(32).toString("base64url");
  const hash = sha256(plain);
  return { plain, hash };
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
