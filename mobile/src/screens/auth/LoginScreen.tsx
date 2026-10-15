import React, { useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Button, CheckSquare, Field, InlineError, Text } from "../../ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginScreen = () => {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showForgot, setShowForgot] = useState(false);

  const emailError = touched && !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address" : undefined;
  const passwordError = touched && !password ? "Enter your password" : undefined;

  const submit = async () => {
    setTouched(true);
    if (!EMAIL_PATTERN.test(email.trim()) || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password, remember);
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign you in. Please try again."));
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.surface }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../../../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="The Office On Rent"
          accessibilityIgnoresInvertColors
        />

        <View style={styles.heading}>
          <Text variant="display" style={styles.title}>
            Welcome back
          </Text>
          <Text variant="body" color="muted">
            Sign in with your CRM account to see your leads, tasks and day.
          </Text>
        </View>

        <View style={styles.form}>
          <Field
            label="Work email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="you@theofficeonrent.com"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={emailError}
            testID="login-email"
          />
          <Field
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secure
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={passwordError}
            testID="login-password"
          />
          <View style={styles.optionsRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: remember }}
              onPress={() => setRemember((value) => !value)}
              hitSlop={6}
              style={styles.remember}
            >
              <CheckSquare checked={remember} size={20} />
              <Text variant="small" style={styles.rememberText}>
                Keep me signed in
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowForgot((value) => !value)} hitSlop={8}>
              <Text variant="smallStrong" color="primary" style={styles.forgotLink}>
                Forgot?
              </Text>
            </Pressable>
          </View>
          {showForgot ? (
            <Text variant="small" color="muted">
              Passwords are reset by your admin. Ask them to set a new one for you from Admin → Users.
            </Text>
          ) : null}
          <InlineError message={error} />
        </View>

        <Button label="Sign in" trailingIcon="arrow-forward" onPress={submit} loading={submitting} testID="login-submit" />

        <View style={styles.spacer} />
        <Text variant="tiny" color="faint" align="center" style={styles.legal}>
          By signing in you agree to the{" "}
          <Text variant="tiny" color="primary" style={styles.legal} accessibilityRole="link" onPress={() => navigation.navigate("Legal", { doc: "terms" })}>
            Terms
          </Text>{" "}
          and the{" "}
          <Text variant="tiny" color="primary" style={styles.legal} accessibilityRole="link" onPress={() => navigation.navigate("Legal", { doc: "privacy" })}>
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, gap: 28, maxWidth: 480, width: "100%", alignSelf: "center" },
  logo: { height: 46, width: 97, alignSelf: "flex-start" },
  heading: { gap: 6 },
  title: { fontSize: 28, lineHeight: 34 },
  form: { gap: 14 },
  optionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  rememberText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold" },
  forgotLink: { fontSize: 13 },
  spacer: { flex: 1, minHeight: 12 },
  legal: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 11, lineHeight: 16 },
});
