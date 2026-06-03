import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(72, "密码不能超过 72 位"),
  name: z.string().min(1, "请填写昵称").max(60).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(1, "请输入密码"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const subscribeSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  source: z.string().max(80).optional(),
});

export const demoRequestSchema = z.object({
  name: z.string().min(1).max(60),
  email: z.string().email(),
  company: z.string().max(120).optional(),
  message: z.string().max(2000).optional(),
});

export const agentTaskSchema = z.object({
  agent: z.enum(["ANALYST", "DIRECTOR", "OPERATOR"]),
  input: z.string().min(1).max(2000),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z
    .string()
    .min(8, "新密码至少 8 位")
    .max(72, "新密码不能超过 72 位"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("邮箱格式不正确"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z
    .string()
    .min(8, "新密码至少 8 位")
    .max(72, "新密码不能超过 72 位"),
});
