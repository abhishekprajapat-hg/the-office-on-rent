import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { mediaUrl } from "../api/client";
import { initials } from "../lib/format";
import { useTheme } from "../theme/ThemeProvider";
import { font } from "../theme/tokens";
import { Text } from "./Text";

/*
 * Rounded-square avatar (the v3 design never uses circles for people).
 * `solid` is the filled blue version used on lead and profile headers.
 */
export const Avatar = ({
  name,
  uri,
  size = 40,
  solid,
  tinted,
}: {
  name?: string;
  uri?: string | null;
  size?: number;
  solid?: boolean;
  /* Pick a soft tone from the name, so a list of people isn't all one blue. */
  tinted?: boolean;
}) => {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const shape = { width: size, height: size, borderRadius: Math.round(size * 0.32) };
  const source = mediaUrl(uri);
  const tones = [
    { fg: colors.primary, bg: colors.primarySoft },
    { fg: colors.violet, bg: colors.violetSoft },
    { fg: colors.success, bg: colors.successSoft },
    { fg: colors.warning, bg: colors.warningSoft },
  ];
  const hash = String(name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const tint = tinted ? tones[hash % tones.length]! : tones[0]!;
  // A broken photo link falls back to initials rather than an empty tile.
  if (source && !failed) return <Image source={{ uri: source }} style={shape} accessibilityLabel={name} onError={() => setFailed(true)} />;
  return (
    <View style={[styles.tile, shape, { backgroundColor: solid ? colors.primary : tint.bg }]}>
      <Text
        style={{ fontFamily: font.extrabold, fontSize: Math.max(10, Math.round(size * 0.33)), lineHeight: Math.round(size * 0.42) }}
        color={solid ? colors.onPrimary : tint.fg}
      >
        {initials(name)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
