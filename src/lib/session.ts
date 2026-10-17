import type { SessionOptions } from "iron-session";
import type { Role } from "@/lib/permissions";

// What we keep in the encrypted session cookie. The user row is still re-loaded from the
// database on every request (see src/server/auth.ts), so deactivating a user or changing
// their role takes effect immediately; `role` here is only used for optimistic redirects.
export type SessionData = {
  userId?: number;
  role?: Role;
};

export const SESSION_COOKIE = "pem_session";

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    ttl: 60 * 60 * 12, // 12 hours
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.SESSION_COOKIE_SECURE === "true",
      path: "/",
    },
  };
}
