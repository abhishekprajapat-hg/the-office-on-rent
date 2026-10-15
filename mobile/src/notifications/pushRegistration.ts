import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api, errorMessage } from "../api/client";
import { pushProblem, type PushStatus } from "../lib/pushStatus";

const TOKEN_KEY = "expo_push_token";

/*
 * Where registration stands, shown in Settings: a phone that silently never
 * registered is why "notifications don't come", and the reason (no Firebase
 * in this build, Expo Go, permission off) is what tells you what to fix.
 */
let status: PushStatus = { state: "idle" };
const listeners = new Set<() => void>();
const setStatus = (next: PushStatus) => {
  status = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const usePushStatus = () => useSyncExternalStore(subscribe, () => status, () => status);

/*
 * Registers this phone with the server's Expo push channel, so chat messages
 * and task updates reach it while the app is closed. The server keys the row
 * on the token, so a phone that changes hands moves to the new user.
 */
export const registerForPush = async () => {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    setStatus({ state: "unsupported", detail: "Push notifications need a real phone, not an emulator." });
    return null;
  }
  if (Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    setStatus({ state: "unsupported", detail: "Expo Go can't receive push notifications on Android. Install the Office On Rent app build to get them." });
    return null;
  }
  setStatus({ state: "registering" });
  try {
    if (Platform.OS === "android") {
      // The channel exists before the permission prompt, so Android 13+ shows the prompt.
      await Notifications.setNotificationChannelAsync("default", {
        name: "Messages and updates",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 120, 200],
        sound: "default",
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    const permission = await Notifications.getPermissionsAsync();
    const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) {
      setStatus({ state: "denied", detail: "Notifications are turned off for this app. Turn them on in the phone's settings." });
      return null;
    }
    const projectId = (Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId) as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.post("/push/subscribe", { kind: "EXPO", token });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setStatus({ state: "registered" });
    return token;
  } catch (err) {
    const raw = err instanceof Error ? err.message : errorMessage(err);
    setStatus({ state: "error", detail: pushProblem(raw) });
    throw err;
  }
};

/* On sign-out, stop delivering this user's notifications to this phone. */
export const unregisterPush = async () => {
  setStatus({ state: "off" });
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await api.post("/push/unsubscribe", { endpoint: token }).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY);
};

export const sendTestPush = async () => {
  const res = await api.post<{ message?: string; sent?: number }>("/push/test");
  return res.data;
};
