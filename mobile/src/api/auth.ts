import { api } from "./client";
import type { AuthResponse, User } from "./types";

/*
 * No `portal` field: the API refuses portal "GENERAL" for an admin, and the
 * web sign-in page learned to omit it so one form serves every role.
 */
export const login = async (email: string, password: string) => {
  const res = await api.post<AuthResponse>("/auth/login", { email: email.trim(), password });
  return res.data;
};

export const getMe = async () => {
  const res = await api.get<{ user?: User }>("/auth/me");
  return res.data?.user || null;
};

/* Revokes this device's refresh token, so a copied token stops working. */
export const logout = async (refreshToken: string | null) => {
  await api.post("/auth/logout", { refreshToken: refreshToken || undefined });
};
