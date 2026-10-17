import { z } from "zod";

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(256),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password: z.string().min(12).max(128),
  shopName: z.string().trim().min(2).max(120),
});

export function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
