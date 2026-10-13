import React, { useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Button, Card, Field, InlineError, Text } from "../../ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginScreen = () => {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailError = touched && !EMAIL_PATTERN.test(email.trim()) ? "Enter a valid email address" : undefined;
  const passwordError = touched && !password ? "Enter your password" : undefined;

  const submit = async () => {
    setTouched(true);
    if (!EMAIL_PATTERN.test(email.trim()) || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign you in. Please try again."));
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Image source={require("../../../assets/icon.png")} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text variant="display" align="center">
            Welcome back
          </Text>
          <Text variant="body" color="muted" align="center">
            Sign in to Office On Rent CRM
          </Text>
        </View>

        <Card style={styles.card}>
          <Field
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
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
          <InlineError message={error} />
          <Button label="Sign in" onPress={submit} loading={submitting} testID="login-submit" />
        </Card>

        <Text variant="small" color="faint" align="center">
          Forgot your password? Ask your admin to reset it.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.xl, gap: space.xl, maxWidth: 480, width: "100%", alignSelf: "center" },
  brand: { alignItems: "center", gap: space.sm },
  logo: { width: 72, height: 72, borderRadius: radius.xl, marginBottom: space.sm },
  card: { gap: space.lg },
});
