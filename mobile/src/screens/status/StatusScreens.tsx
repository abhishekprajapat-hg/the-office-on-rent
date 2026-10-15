import React, { useEffect } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { StatusPage } from "../../ui";

const Page = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>{children}</View>;
};

/*
 * "Done" after creating or sending something: what happened, the obvious next
 * step, and a way back. It replaces the form, so Back never reopens a form
 * that was already submitted.
 */
export const SuccessScreen = ({ route, navigation }: RootScreenProps<"Success">) => {
  const { title, message, detail, next, doneLabel = "Done" } = route.params;
  const done = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs", { screen: "Home" }));

  // Hardware back means "done", not "back into the form".
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      done();
      return true;
    });
    return () => sub.remove();
  });

  return (
    <Page>
      <StatusPage
        kind="success"
        title={title}
        message={message}
        detail={detail}
        primary={
          next
            ? {
                label: next.label,
                icon: "arrow-forward",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onPress: () => (navigation as any).replace(next.screen, next.params),
              }
            : { label: doneLabel, icon: "checkmark", onPress: done }
        }
        secondary={next ? { label: doneLabel, onPress: done } : undefined}
      />
    </Page>
  );
};

/* A deep link the app doesn't know (an old notification, a mistyped URL). Signed out, it leads to sign-in. */
export const NotFoundScreen = ({ route, navigation }: RootScreenProps<"NotFound">) => {
  const signedIn = navigation.getState().routeNames.includes("Tabs");
  return (
    <Page>
      <StatusPage
        kind="notFound"
        detail={route.params?.path ? `Link: ${route.params.path}` : undefined}
        primary={
          signedIn
            ? { label: "Go to Home", icon: "home-outline", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Tabs" }] }) }
            : { label: "Go to sign in", icon: "log-in-outline", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }) }
        }
        secondary={navigation.canGoBack() ? { label: "Go back", onPress: () => navigation.goBack() } : undefined}
      />
    </Page>
  );
};

/* Something this role can't open. */
export const NoAccessScreen = ({ route, navigation }: RootScreenProps<"NoAccess">) => (
  <Page>
    <StatusPage
      kind="noAccess"
      message={route.params?.what ? `Your role can't open ${route.params.what}. Ask an admin if you need it.` : undefined}
      primary={{ label: "Go to Home", icon: "home-outline", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Tabs" }] }) }}
      secondary={navigation.canGoBack() ? { label: "Go back", onPress: () => navigation.goBack() } : undefined}
    />
  </Page>
);

const styles = StyleSheet.create({
  page: { flex: 1 },
});
