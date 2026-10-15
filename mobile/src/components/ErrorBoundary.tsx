import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as Updates from "expo-updates";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { StatusPage } from "../ui";

/*
 * The crash page. A render error anywhere below would otherwise leave a blank
 * (or red) screen; this keeps the app standing with a way out: try the
 * screen again, or restart the app.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashPage error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

const restart = () => {
  if (Platform.OS === "web") {
    globalThis.location?.reload();
    return;
  }
  Updates.reloadAsync().catch(() => {});
};

const CrashPage = ({ error, onRetry }: { error: Error; onRetry: () => void }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <StatusPage
        kind="error"
        title="Something went wrong"
        message="This screen hit a problem and had to stop. Your data is safe on the server."
        detail={__DEV__ ? error.message : undefined}
        primary={{ label: "Try again", icon: "refresh", onPress: onRetry }}
        secondary={{ label: "Restart the app", onPress: restart }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
});
