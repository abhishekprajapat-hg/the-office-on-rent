import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "../api/client";

const TOKEN_KEY = "expo_push_token";

/*
 * Registers this phone with the server's Expo push channel, so chat messages
 * and task updates reach it while the app is closed. The server keys the row
 * on the token, so a phone that changes hands moves to the new user.
 */
export const registerForPush = async () => {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted || (permission.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Messages and updates", importance: Notifications.AndroidImportance.HIGH });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.post("/push/subscribe", { kind: "EXPO", token });
  await AsyncStorage.setItem(TOKEN_KEY, token);
  return token;
};

/* On sign-out, stop delivering this user's notifications to this phone. */
export const unregisterPush = async () => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await api.post("/push/unsubscribe", { endpoint: token }).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY);
};

export const sendTestPush = async () => {
  const res = await api.post<{ message?: string; sent?: number }>("/push/test");
  return res.data;
};
