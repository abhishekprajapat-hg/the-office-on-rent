import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { listInventory, type Property } from "../../api/inventory";
import { linkProperty, selectLinkedProperty } from "../../api/leads";
import { sendMessage } from "../../api/chat";
import { PropertyCard } from "../../components/PropertyCard";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { EmptyState, Field, InlineError, Loading } from "../../ui";

/* Search available inventory and link one to the lead. */
export const PickPropertyScreen = ({ route, navigation }: RootScreenProps<"PickProperty">) => {
  const { leadId, select, chatId } = route.params;
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      listInventory({ search: query.trim(), status: "Available", limit: 30 })
        .then((result) => alive && setItems(result.items))
        .catch((err) => alive && setError(errorMessage(err)));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const pick = async (property: Property) => {
    if (linking) return;
    setLinking(true);
    setError(null);
    try {
      if (chatId) {
        // Shared into a chat: the server builds the card from the listing.
        await sendMessage(chatId, "", { sharedProperty: { inventoryId: property._id } });
      } else if (leadId) {
        await linkProperty(leadId, property._id);
        // Picked for a closing: it must also be the lead's selected property.
        if (select) await selectLinkedProperty(leadId, property._id);
      }
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setLinking(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <Field icon="search" value={query} onChangeText={setQuery} placeholder="Search available properties" autoCorrect={false} />
        <InlineError message={error} />
      </View>
      {items === null ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.list, !items.length && styles.grow]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<EmptyState icon="business-outline" title="Nothing available" message="Try a different search." />}
          renderItem={({ item }) => <PropertyCard property={item} onPress={() => pick(item)} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  grow: { flexGrow: 1 },
  top: { padding: space.lg, gap: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  separator: { height: space.md },
});
