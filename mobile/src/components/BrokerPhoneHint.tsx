import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { identifyPhone } from "../api/contacts";
import { useTheme } from "../theme/ThemeProvider";
import { Icon, Text } from "../ui";

/*
 * Warns while the number is still being typed that it belongs to a broker
 * (web BrokerPhoneHint): the server refuses a broker's number as a lead, and
 * finding that out after filling in the rest of the form wastes the effort.
 * The answer is held against the number it was asked for, so a slow reply for
 * an earlier number never labels the current one.
 */
export const BrokerPhoneHint = ({ phone }: { phone: string }) => {
  const { colors } = useTheme();
  const [match, setMatch] = useState<{ phone: string; name: string } | null>(null);

  useEffect(() => {
    const current = phone;
    let active = true;
    const timer = setTimeout(() => {
      if (current.replace(/\D/g, "").length < 7) {
        if (active) setMatch(null);
        return;
      }
      identifyPhone(current)
        .then((data) => {
          if (active) setMatch(data?.isBroker ? { phone: current, name: data.name || "This number" } : null);
        })
        .catch(() => {
          if (active) setMatch(null);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [phone]);

  if (!match || match.phone !== phone) return null;
  return (
    <View accessibilityRole="alert" style={styles.row}>
      <Icon name="shield-outline" size={14} color={colors.warning} />
      <Text variant="tiny" color={colors.warning} style={styles.text}>
        {match.name} is in the Broker Database, so this number can't be saved as a lead.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: -4 },
  text: { flex: 1 },
});
