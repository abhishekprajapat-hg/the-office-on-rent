import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { errorMessage } from "../../api/client";
import { listInventory, type Property } from "../../api/inventory";
import { PropertyCard } from "../../components/PropertyCard";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { ChipRow, EmptyState, ErrorState, Field, HeaderButton, Loading, Text } from "../../ui";

const STATUS = [
  { key: "ALL", label: "All" },
  { key: "Available", label: "Available" },
  { key: "Blocked", label: "Reserved" },
  { key: "Sold", label: "Sold" },
] as const;

const DEAL = [
  { key: "ALL", label: "Sale or rent" },
  { key: "Sale", label: "For sale" },
  { key: "Rent", label: "For rent" },
] as const;

const KIND = [
  { key: "ALL", label: "All types" },
  { key: "COMMERCIAL", label: "Commercial" },
  { key: "RESIDENTIAL", label: "Residential" },
] as const;

const PAGE_SIZE = 20;

export const InventoryScreen = ({ navigation }: RootScreenProps<"Inventory">) => {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]["key"]>("Available");
  const [deal, setDeal] = useState<(typeof DEAL)[number]["key"]>("ALL");
  const [kind, setKind] = useState<(typeof KIND)[number]["key"]>("ALL");
  const [items, setItems] = useState<Property[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useLayoutHeader(navigation);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (nextPage: number, mode: "replace" | "append" | "refresh" | "silent") => {
      const id = ++requestId.current;
      if (mode === "append") setLoadingMore(true);
      if (mode === "refresh") setRefreshing(true);
      try {
        const result = await listInventory({ page: nextPage, limit: PAGE_SIZE, search, status, type: deal, inventoryType: kind });
        if (id !== requestId.current) return;
        setItems((previous) => (mode === "append" ? [...previous, ...result.items] : result.items));
        setPage(nextPage);
        setHasMore(Boolean(result.pagination?.hasNextPage));
        setTotal(result.pagination?.totalCount ?? result.items.length);
        setError(null);
      } catch (err) {
        if (id === requestId.current && mode !== "silent") setError(errorMessage(err));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [search, status, deal, kind],
  );

  useEffect(() => {
    setLoading(true);
    load(1, "replace");
  }, [load]);

  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) load(1, "silent");
      focused.current = true;
    }, [load]),
  );

  const filtered = Boolean(search) || status !== "ALL" || deal !== "ALL" || kind !== "ALL";

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.top}>
        <Field
          icon="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search project, location, owner"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View style={styles.chips}>
        <ChipRow options={[...STATUS]} value={status} onChange={setStatus} />
        <ChipRow options={[...DEAL]} value={deal} onChange={setDeal} />
        <ChipRow options={[...KIND]} value={kind} onChange={setKind} />
      </View>
      <Text variant="small" color="muted" style={styles.count}>
        {total === null ? " " : `${total} propert${total === 1 ? "y" : "ies"}`}
      </Text>

      {loading ? (
        <Loading />
      ) : error && !items.length ? (
        <ErrorState message={error} onRetry={() => load(1, "replace")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <PropertyCard property={item} onPress={() => navigation.navigate("PropertyDetail", { id: item._id })} />}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={[styles.list, !items.length && styles.grow]}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore && !loading) load(page + 1, "append");
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, "refresh")} tintColor={colors.primary} colors={[colors.primary]} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="business-outline"
              title={filtered ? "No properties match" : "No properties yet"}
              message={filtered ? "Try a different search or filter." : "Add the first one to start building your inventory."}
              actionLabel={filtered ? "Clear filters" : "Add property"}
              onAction={() => {
                if (!filtered) return navigation.navigate("AddProperty");
                setQuery("");
                setStatus("ALL");
                setDeal("ALL");
                setKind("ALL");
              }}
            />
          }
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
};

/* The add button lives in the native header, so the list keeps the full height. */
const useLayoutHeader = (navigation: RootScreenProps<"Inventory">["navigation"]) => {
  React.useLayoutEffect(() => {
    navigation.setOptions({
      // Native headers inset their buttons; the web header does not.
      headerRight: () => (
        <View style={Platform.OS === "web" ? styles.webInset : undefined}>
          <HeaderButton icon="add" label="Add property" onPress={() => navigation.navigate("AddProperty")} />
        </View>
      ),
    });
  }, [navigation]);
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  root: { flex: 1 },
  grow: { flexGrow: 1 },
  top: { paddingHorizontal: space.lg, paddingTop: space.md },
  chips: { gap: space.sm, paddingTop: space.md },
  count: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  separator: { height: space.md },
  more: { paddingVertical: space.lg },
  webInset: { marginRight: space.lg },
});
