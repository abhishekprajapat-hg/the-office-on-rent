/*
 * Push registration state, and the plain-words reason when it fails. Pure;
 * unit tested.
 */
export type PushStatus = {
  state: "idle" | "registering" | "registered" | "denied" | "unsupported" | "error" | "off";
  detail?: string;
};

/* Turns the native error from getExpoPushTokenAsync / subscribe into what to do about it. */
export const pushProblem = (raw: string) => {
  const text = String(raw || "");
  if (/firebase|fcm|google-services|FirebaseApp/i.test(text)) {
    return "This app build has no Firebase (FCM) setup, so Android can't receive push notifications. A new build with google-services.json fixes it.";
  }
  if (/projectId/i.test(text)) return "This app build is missing its EAS project id, so it can't get a push token.";
  if (/network|timeout|offline/i.test(text)) return "Couldn't reach the server to register this phone. It retries next time the app opens.";
  if (/aps-environment|apns|entitlement/i.test(text)) return "This iPhone build isn't signed for push notifications.";
  return text ? `Couldn't register for notifications: ${text}` : "Couldn't register for notifications.";
};

export const pushStatusLabel = (status: PushStatus) =>
  ({
    idle: "Not checked yet",
    registering: "Connecting…",
    registered: "On for this phone",
    denied: "Blocked by the phone",
    unsupported: "Not available here",
    error: "Not working",
    off: "Off",
  })[status.state];
