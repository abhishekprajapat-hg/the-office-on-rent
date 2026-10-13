import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "./types";

/*
 * Same storage keys as the previous app, so people who update from the old
 * build stay signed in instead of being thrown back to the login screen.
 */
const TOKEN = "token";
const REFRESH = "refresh_token";
const ROLE = "role";
const USER = "user";
const EXPIRES_AT = "session_expires_at";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const expired = async () => {
  const raw = Number(await AsyncStorage.getItem(EXPIRES_AT));
  return Number.isFinite(raw) && raw > 0 && Date.now() >= raw;
};

export const session = {
  async getToken() {
    if (await expired()) {
      await this.clear();
      return null;
    }
    return AsyncStorage.getItem(TOKEN);
  },

  getRefreshToken() {
    return AsyncStorage.getItem(REFRESH);
  },

  async getUser(): Promise<User | null> {
    if (await expired()) {
      await this.clear();
      return null;
    }
    const raw = await AsyncStorage.getItem(USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  async set(token: string, user: User, refreshToken?: string | null) {
    const pairs: [string, string][] = [
      [TOKEN, token],
      [ROLE, user.role],
      [USER, JSON.stringify(user)],
      [EXPIRES_AT, String(Date.now() + SESSION_TTL_MS)],
    ];
    if (refreshToken) pairs.push([REFRESH, refreshToken]);
    await AsyncStorage.multiSet(pairs);
  },

  async setUser(user: User) {
    await AsyncStorage.multiSet([
      [USER, JSON.stringify(user)],
      [ROLE, user.role],
    ]);
  },

  async clear() {
    await AsyncStorage.multiRemove([TOKEN, REFRESH, ROLE, USER, EXPIRES_AT]);
  },
};
