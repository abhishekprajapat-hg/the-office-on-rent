import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { NotificationBridge } from "./src/notifications/NotificationBridge";
import { BootSplash } from "./src/screens/auth/BootSplash";
import { AppLock } from "./src/components/AppLock";
import { IdleSignOut } from "./src/components/IdleSignOut";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Shell = () => {
  const { colors, scheme, ready: themeReady } = useTheme();
  const { booting } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    JetBrainsMono_500Medium,
  });

  // A font that fails to load falls back to the system face rather than
  // holding the splash forever.
  const fontsReady = themeReady && (fontsLoaded || Boolean(fontError));

  // The native splash only covers font loading; restoring the session then
  // shows the design's own splash (01) with its progress bar.
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;
  if (booting) return <BootSplash />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AppLock>
        <IdleSignOut>
          <RootNavigator />
          <NotificationBridge />
        </IdleSignOut>
      </AppLock>
    </View>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
