import React from "react";
import { StyleSheet, View } from "react-native";
import { LEGAL_DOCS } from "../../lib/legal";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Body, Icon, Text } from "../../ui";

/* Privacy policy and terms (web /privacy-policy, /terms-and-conditions), readable signed in or out. */
export const LegalScreen = ({ route, navigation }: RootScreenProps<"Legal">) => {
  const { colors } = useTheme();
  const doc = LEGAL_DOCS[route.params?.doc === "terms" ? "terms" : "privacy"];
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: doc.title });
  }, [navigation, doc.title]);

  return (
    <Body>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={route.params?.doc === "terms" ? "document-text" : "shield-checkmark"} size={20} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="label" color="primary">
            Legal
          </Text>
          <Text variant="title">{doc.title}</Text>
          <Text variant="small" color="muted">
            Last updated {doc.updated}
          </Text>
        </View>
      </View>
      {doc.sections.map((section) => (
        <View key={section.title} style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="smallStrong" style={styles.sectionTitle}>
            {section.title}
          </Text>
          <Text variant="body" color="muted">
            {section.body}
          </Text>
        </View>
      ))}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 4 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  section: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  sectionTitle: { textTransform: "uppercase", letterSpacing: 0.6 },
});
