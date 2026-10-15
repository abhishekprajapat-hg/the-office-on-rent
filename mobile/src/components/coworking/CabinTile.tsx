import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { STATUS_META, type Cabin } from "../../lib/coworkingBoard";
import { useTheme } from "../../theme/ThemeProvider";
import { Icon, Text } from "../../ui";

/* A cabin on the board (web CabinTile): label, capacity and who holds it, tinted by status. "plan" is the label only, for the floor plan. */
export const CabinTile = ({
  cabin,
  onPress,
  selected,
  inCart,
  dimmed,
  variant = "grid",
  style,
}: {
  cabin: Cabin;
  onPress: (cabin: Cabin) => void;
  selected?: boolean;
  inCart?: boolean;
  dimmed?: boolean;
  variant?: "grid" | "plan";
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors, scheme } = useTheme();
  const meta = STATUS_META[cabin.status];
  const isLet = cabin.status === "BOOKED" || cabin.status === "RESERVED";
  const holder = isLet ? cabin.client?.name || "" : meta.label;
  const plan = variant === "plan";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cabin ${cabin.label}, ${cabin.seats} seater, ${isLet ? `${cabin.status === "RESERVED" ? "held for" : "let to"} ${holder}` : meta.label.toLowerCase()}`}
      onPress={() => onPress(cabin)}
      style={[
        plan ? styles.plan : styles.tile,
        {
          backgroundColor: `${meta.color}${scheme === "dark" ? "33" : "14"}`,
          borderColor: selected || inCart ? colors.primary : `${meta.color}55`,
          borderWidth: selected || inCart ? 2 : 1,
          opacity: dimmed ? 0.3 : 1,
        },
        style,
      ]}
    >
      {inCart ? (
        <View style={[styles.check, { backgroundColor: colors.primary }]}>
          <Icon name="checkmark" size={10} color={colors.onPrimary} />
        </View>
      ) : null}
      <Text variant={plan ? "tiny" : "bodyStrong"} color={meta.color} numberOfLines={1} style={plan ? styles.planLabel : styles.label}>
        {cabin.label}
      </Text>
      {plan ? null : (
        <>
          <Text variant="tiny" color="muted">
            {cabin.seats} seater
          </Text>
          <Text variant="tiny" numberOfLines={1} style={styles.holder}>
            {holder}
          </Text>
        </>
      )}
    </Pressable>
  );
};

export const StatusDot = ({ status, size = 8 }: { status: keyof typeof STATUS_META; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: STATUS_META[status].color }} />
);

const styles = StyleSheet.create({
  tile: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center", gap: 2, minHeight: 78, justifyContent: "center" },
  plan: { position: "absolute", borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  label: { fontSize: 15 },
  planLabel: { fontSize: 9, fontFamily: "PlusJakartaSans_700Bold" },
  holder: { maxWidth: "100%" },
  check: { position: "absolute", top: 0, right: 0, width: 16, height: 16, borderBottomLeftRadius: 8, alignItems: "center", justifyContent: "center" },
});
