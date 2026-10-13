import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { listLeads } from "../../api/leads";
import type { Lead } from "../../api/types";
import { LeadRow } from "../../components/LeadRow";
import { useUser } from "../../auth/AuthProvider";
import { activeFilterCount, filterParams, type LeadFilters } from "../../lib/leadFilters";
import { isManagement } from "../../lib/roles";
import { LeadFiltersSheet } from "./LeadFiltersSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { ChipRow, EmptyState, ErrorState, Field, HeaderButton, Icon, Loading, Text } from "../../ui";

/*
 * The web list filters on any of 20 statuses from a flyout. On a phone the
 * useful cuts are a handful of chips: the stage someone is working, plus
 * "Follow-ups due", which is what an executive opens the app for.
 */
const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DUE", label: "Follow-ups due" },
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "INTERESTED", label: "Interested" },
  { key: "SITE_VISIT_SCHEDULED", label: "Visit scheduled" },
  { key: "SITE_VISIT", label: "Site visit" },
  { key: "CLOSED", label: "Closed" },
  { key: "LOST", label: "Lost" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const PAGE_SIZE = 25;

export const LeadsScreen = () => {
  const navigation = useNavigation();
  const user = useUser();
  const { colors } = useTheme();
  const [filters, setFilters] = useState<LeadFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = activeFilterCount(filters);
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Debounce typing so every keystroke isn't a request.
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
        const { leads: rows, pagination } = await listLeads({
          page: nextPage,
          limit: PAGE_SIZE,
          search,
          status: filter === "DUE" ? undefined : filter,
          followUpDueOnly: filter === "DUE",
          extra: filterParams(filters),
        });
        // A slower, older request must not overwrite a newer one.
        if (id !== requestId.current) return;
        setLeads((previous) => (mode === "append" ? [...previous, ...rows] : rows));
        setPage(nextPage);
        setHasMore(Boolean(pagination?.hasNextPage));
        setTotal(pagination?.totalCount ?? null);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        if (mode !== "silent") setError(errorMessage(err));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [search, filter, filters],
  );

  useEffect(() => {
    setLoading(true);
    load(1, "replace");
  }, [load]);

  // Back from a lead or a new lead: refresh what's on screen without a spinner.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) load(1, "silent");
      focused.current = true;
    }, [load]),
  );

  const filtered = Boolean(search) || filter !== "ALL" || filterCount > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="display">Leads</Text>
          <Text variant="small" color="muted">
            {total === null ? " " : `${total.toLocaleString("en-IN")} ${filtered ? "matching" : "in your pipeline"}`}
          </Text>
        </View>
        {isManagement(user.role) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Team pipeline"
            onPress={() => navigation.navigate("TeamPipeline")}
            style={[styles.teamButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Icon name="people" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bulk upload leads"
          onPress={() => navigation.navigate("BulkUpload")}
          style={[styles.teamButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Icon name="cloud-upload-outline" size={20} color={colors.primary} />
        </Pressable>
        <HeaderButton icon="add" label="Add lead" onPress={() => navigation.navigate("AddLead")} />
      </View>
      <View style={styles.search}>
        <View style={styles.flex}>
        <Field
          icon="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone, city, project"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : "Filters"}
          onPress={() => setFiltersOpen(true)}
          style={[styles.filterButton, { backgroundColor: filterCount ? colors.primary : colors.surface, borderColor: filterCount ? colors.primary : colors.border }]}
        >
          <Icon name="options" size={20} color={filterCount ? colors.onPrimary : colors.text} />
          {filterCount ? (
            <View style={[styles.filterBadge, { backgroundColor: colors.danger }]}>
              <Text variant="tiny" color="#fff">
                {filterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <View style={styles.chips}>
        <ChipRow options={[...FILTERS]} value={filter} onChange={setFilter} />
      </View>

      {loading ? (
        <Loading />
      ) : error && !leads.length ? (
        <ErrorState message={error} onRetry={() => load(1, "replace")} />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(lead) => lead._id}
          renderItem={({ item }) => (
            <LeadRow lead={item} onPress={() => navigation.navigate("LeadDetail", { leadId: item._id, name: item.name })} />
          )}
          contentContainerStyle={[styles.list, !leads.length && styles.flexGrow]}
          ItemSeparatorComponent={Separator}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore && !loading) load(page + 1, "append");
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(1, "refresh")} tintColor={colors.primary} colors={[colors.primary]} />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
          ListEmptyComponent={
            filtered ? (
              <EmptyState
                icon="search"
                title="No leads match"
                message="Try a different search or filter."
                actionLabel="Clear filters"
                onAction={() => {
                  setQuery("");
                  setFilter("ALL");
                  setFilters({});
                }}
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title="No leads yet"
                message="Leads assigned to you will appear here."
                actionLabel="Add a lead"
                onAction={() => navigation.navigate("AddLead")}
              />
            )
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
      <LeadFiltersSheet
        visible={filtersOpen}
        value={filters}
        canFilterAssignee={isManagement(user.role)}
        onApply={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  search: { paddingHorizontal: space.lg, paddingTop: space.md, flexDirection: "row", gap: space.sm, alignItems: "center" },
  teamButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  filterButton: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  filterBadge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  chips: { paddingVertical: space.md },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  separator: { height: space.sm },
  more: { paddingVertical: space.lg },
});
