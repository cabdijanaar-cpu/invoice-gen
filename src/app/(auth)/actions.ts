"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroyCurrentSession } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { consumeAuthAttempt } from "@/server/auth/rate-limit";
import { loginSchema, readFormString, registerSchema } from "@/server/auth/validation";

export type AuthActionState = { error?: string };

function logAuthFailure(context: string, error: unknown): void {
  const value = error as { name?: unknown; code?: unknown } | null;
  console.error(`[auth] ${context}`, {
    errorName: typeof value?.name === "string" ? value.name : "UnknownError",
    errorCode: typeof value?.code === "string" ? value.code : undefined,
  });
}

export async function loginAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: readFormString(formData, "email"),
    password: readFormString(formData, "password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  try {
    if (!(await consumeAuthAttempt("login", parsed.data.email))) {
      return { error: "Too many attempts. Wait a minute before trying again." };
    }
  } catch (error) {
    logAuthFailure("login rate-limit check failed", error);
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }

  let user;
  try {
    user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || user.status !== "ACTIVE" || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return { error: "Email or password is incorrect, or the account is unavailable." };
    }
    await createSession(user.id, "AUTH_LOGIN_SUCCESS");
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }

  redirect("/dashboard");
}

export async function registerAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: readFormString(formData, "name"),
    email: readFormString(formData, "email"),
    password: readFormString(formData, "password"),
    shopName: readFormString(formData, "shopName"),
  });
  if (!parsed.success) {
    return { error: "Enter your name, a valid email, a shop name, and a password of at least 12 characters." };
  }

  try {
    if (!(await consumeAuthAttempt("register", parsed.data.email))) {
      return { error: "Too many attempts. Wait a minute before trying again." };
    }
  } catch (error) {
    logAuthFailure("registration rate-limit check failed", error);
    return { error: "Account creation is temporarily unavailable. Please try again." };
  }

  let userId: string;
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
        select: { id: true },
      });
      await tx.shop.create({
        data: {
          name: parsed.data.shopName,
          createdBy: { connect: { id: createdUser.id } },
          settings: { create: {} },
          memberships: {
            create: { user: { connect: { id: createdUser.id } }, role: "SHOP_OWNER" },
          },
        },
      });
      await tx.auditLog.create({ data: { actorId: createdUser.id, action: "AUTH_ACCOUNT_REGISTERED", entityType: "User", entityId: createdUser.id, summary: "Account registered" } });
      return { id: createdUser.id };
    });
    userId = user.id;
  } catch (error) {
    logAuthFailure("account creation failed", error);
    const errorCode = (error as { code?: unknown } | null)?.code;
    if (errorCode === "P2002") {
      return { error: "An account with this email already exists. Sign in or reset your password." };
    }
    return { error: "We could not create the account. Check the details or try again." };
  }

  try {
    await createSession(userId);
  } catch {
    return { error: "Your account was created, but sign-in could not start. Please sign in." };
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
