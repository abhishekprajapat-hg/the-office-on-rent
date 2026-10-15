import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

/* "Face ID", "Fingerprint" or "Face unlock" - whatever this phone offers, or null when it has none enrolled. */
export const biometricLabel = async (): Promise<string | null> => {
  if (Platform.OS === "web") return null;
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    if (!hardware || !enrolled) return null;
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "Face ID" : "Face unlock";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    return "Device lock";
  } catch {
    return null;
  }
};

export const unlock = async (prompt = "Unlock The Office on Rent") => {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: "Cancel", disableDeviceFallback: false });
    return result.success;
  } catch {
    return false;
  }
};
