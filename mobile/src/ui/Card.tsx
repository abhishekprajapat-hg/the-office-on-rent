import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius } from "../theme/tokens";

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /* A soft drop shadow, for cards that float over a hero band. */
  elevated?: boolean;
  accessibilityLabel?: string;
};

/* White card with a 1px line border and 18px corners - the design's basic surface. */
export const Card = ({ children, onPress, style, padded = true, elevated, accessibilityLabel }: Props) => {
  const { colors, scheme } = useTheme();
  const base = [
    styles.card,
    padded && styles.padded,
    { backgroundColor: colors.surface, borderColor: colors.border },
    elevated && scheme === "light" && styles.elevated,
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1 },
  padded: { padding: 14 },
  elevated: {
    shadowColor: "#0e1630",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
});
