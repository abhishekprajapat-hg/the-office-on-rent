import React, { useCallback } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthProvider";
import { canOpenPage } from "../api/access";
import { chatInbox, useUnreadChats } from "../notifications/chatInbox";
import { useTheme } from "../theme/ThemeProvider";
import { font } from "../theme/tokens";
import { Icon, Text } from "../ui";

/* The chat icon beside the bell on Home, with the unread count. Hidden for roles without chat. */
export const ChatButton = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const { user, access } = useAuth();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const unread = useUnreadChats();
  const allowed = canOpenPage(user, access, "chat");
  // Fresh each time Home comes back into view (the socket keeps it current in between).
  useFocusEffect(
    useCallback(() => {
      if (allowed) chatInbox.refresh();
    }, [allowed]),
  );
  if (!allowed) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Team chat, ${unread} unread` : "Team chat"}
      onPress={() => navigation.navigate("Chats")}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
    >
      <Icon name="chatbubble-ellipses-outline" size={20} color={colors.text} />
      {unread ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
          <Text variant="tiny" color="#fff" style={styles.badgeText} allowFontScaling={false}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
  badge: { position: "absolute", top: 3, right: 1, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 9.5, lineHeight: 12, fontFamily: font.extrabold },
});
