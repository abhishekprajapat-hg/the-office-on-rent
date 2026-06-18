import { Platform } from "react-native";

export async function ensureNotificationSetup(): Promise<void> {
  // Mock/No-op push notification setup for local run
  console.log("Push notifications setup initiated (mock)");
}

export function registerNotificationTapListener(callback: (payload: any) => void): { remove: () => void } {
  console.log("Push notifications tap listener registered (mock)");
  return {
    remove: () => {
      console.log("Push notifications tap listener removed (mock)");
    },
  };
}

export async function notifyChatMessage(payload: {
  conversationId: string;
  contactId: string;
  contactName: string;
  contactRole: string;
  contactAvatar: string;
  message: string;
}): Promise<void> {
  console.log("Notification trigger (mock):", payload);
}
