import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { listContacts, openDirectChat } from "../../api/chat";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Avatar, EmptyState, ErrorState, Field, Icon, InlineError, Loading, Text } from "../../ui";

export const NewChatScreen = ({ navigation }: RootScreenProps<"NewChat">) => {
  const { colors } = useTheme();
  const { data, loading, error, refresh } = useQuery(listContacts, []);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data || [])
      .filter((person) => !needle || person.name.toLowerCase().includes(needle) || roleLabel(person.role).toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query]);

  const open = async (id: string, name: string) => {
    setOpening(id);
    setOpenError(null);
    try {
      const room = await openDirectChat(id);
      if (!room) throw new Error("Couldn't open that chat.");
      navigation.replace("Conversation", { id: room._id, title: name });
    } catch (err) {
      setOpenError(errorMessage(err));
      setOpening(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <Field icon="search" value={query} onChangeText={setQuery} placeholder="Search people" autoCorrect={false} />
        <InlineError message={openError} />
      </View>
      <FlatList
        data={people}
        keyExtractor={(person) => person._id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, !people.length && styles.grow]}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No one found" message="Try a different name." />}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${item.name}`}
            disabled={Boolean(opening)}
            onPress={() => open(item._id, item.name)}
            style={({ pressed }) => [
              styles.row,
              index < people.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Avatar name={item.name} uri={item.profileImageUrl} size={42} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{item.name}</Text>
              <Text variant="small" color="muted">
                {item.roleLabel || roleLabel(item.role)}
              </Text>
            </View>
            <Icon name={opening === item._id ? "hourglass-outline" : "chatbubble-outline"} size={20} color={colors.primary} />
          </Pressable>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  top: { padding: space.lg, gap: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
