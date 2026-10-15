import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { createGroup, listContacts, openDirectChat } from "../../api/chat";
import { roleLabel } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Button, CheckSquare, EmptyState, ErrorState, Field, FooterBar, Icon, InlineError, Loading, Text } from "../../ui";

/* One-to-one chat, or (for managers) a named group of teammates. */
export const NewChatScreen = ({ route, navigation }: RootScreenProps<"NewChat">) => {
  const group = Boolean(route.params?.group);
  const { colors } = useTheme();
  const { data, loading, error, refresh } = useQuery(listContacts, []);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: group ? "New group" : "New chat" });
  }, [navigation, group]);

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data || [])
      .filter((person) => !needle || person.name.toLowerCase().includes(needle) || roleLabel(person.role).toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query]);

  const open = async (id: string, personName: string) => {
    setOpening(id);
    setOpenError(null);
    try {
      const room = await openDirectChat(id);
      if (!room) throw new Error("Couldn't open that chat.");
      navigation.replace("Conversation", { id: room._id, title: personName });
    } catch (err) {
      setOpenError(errorMessage(err));
      setOpening(null);
    }
  };

  const create = async () => {
    if (!name.trim()) return setOpenError("Give the group a name.");
    if (picked.length < 2) return setOpenError("Pick at least two people.");
    setOpening("group");
    setOpenError(null);
    try {
      const room = await createGroup(name.trim(), picked);
      if (!room) throw new Error("Couldn't create the group.");
      navigation.replace("Conversation", { id: room._id, title: name.trim() });
    } catch (err) {
      setOpenError(errorMessage(err));
      setOpening(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={styles.top}>
        {group ? <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Noida Sales Team" maxLength={80} /> : null}
        <Field icon="search" compact value={query} onChangeText={setQuery} placeholder="Search people" autoCorrect={false} />
        {group && picked.length ? (
          <Text variant="smallStrong" color="primary">
            {picked.length} selected
          </Text>
        ) : null}
        <InlineError message={openError} />
      </View>
      <FlatList
        data={people}
        keyExtractor={(person) => person._id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, !people.length && styles.grow]}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No one found" message="Try a different name." />}
        renderItem={({ item, index }) => {
          const selected = picked.includes(item._id);
          return (
            <Pressable
              accessibilityRole={group ? "checkbox" : "button"}
              accessibilityState={group ? { checked: selected } : undefined}
              accessibilityLabel={group ? item.name : `Chat with ${item.name}`}
              disabled={Boolean(opening)}
              onPress={() => (group ? toggle(item._id) : open(item._id, item.name))}
              style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }, pressed && { opacity: 0.6 }]}
            >
              <Avatar name={item.name} uri={item.profileImageUrl} size={42} tinted />
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={styles.name}>
                  {item.name}
                </Text>
                <Text variant="small" color="muted">
                  {item.roleLabel || roleLabel(item.role)}
                </Text>
              </View>
              {group ? (
                <CheckSquare checked={selected} />
              ) : (
                <Icon name={opening === item._id ? "hourglass-outline" : "chatbubble-outline"} size={20} color={colors.primary} />
              )}
            </Pressable>
          );
        }}
      />
      {group ? (
        <FooterBar>
          <Button label={picked.length ? `Create group · ${picked.length + 1} people` : "Create group"} icon="people" style={styles.flex} loading={opening === "group"} onPress={create} />
        </FooterBar>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  grow: { flexGrow: 1 },
  top: { padding: 16, gap: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  name: { fontSize: 14 },
});
