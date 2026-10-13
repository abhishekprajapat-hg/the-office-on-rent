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
}: {
  name?: string;
  uri?: string | null;
  size?: number;
  solid?: boolean;
}) => {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const shape = { width: size, height: size, borderRadius: Math.round(size * 0.32) };
  const source = mediaUrl(uri);
  // A broken photo link falls back to initials rather than an empty tile.
  if (source && !failed) return <Image source={{ uri: source }} style={shape} accessibilityLabel={name} onError={() => setFailed(true)} />;
  return (
    <View style={[styles.tile, shape, { backgroundColor: solid ? colors.primary : colors.primarySoft }]}>
      <Text
        style={{ fontFamily: font.extrabold, fontSize: Math.max(10, Math.round(size * 0.33)), lineHeight: Math.round(size * 0.42) }}
        color={solid ? colors.onPrimary : colors.primary}
      >
        {initials(name)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center" },
});
