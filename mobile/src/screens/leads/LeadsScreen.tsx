import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage } from "../../api/client";
import { listLeads } from "../../api/leads";
import type { Lead } from "../../api/types";
import { LeadRow } from "../../components/LeadRow";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { canDoPageAction } from "../../api/access";
import { datedFileName, toCsv } from "../../lib/csv";
import { formatDate } from "../../lib/format";
import { statusMeta } from "../../lib/leadStatus";
import { shareTextFile } from "../../lib/shareFile";
import { activeFilterCount, filterParams, type LeadFilters } from "../../lib/leadFilters";
import { isManagement } from "../../lib/roles";
import { LeadFiltersSheet } from "./LeadFiltersSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { gutter, space } from "../../theme/tokens";
import { ActionSheet, FilterDropdown, EmptyState, ErrorState, Field, HeaderButton, Loading, Text, OfflineBanner } from "../../ui";

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
  const { access } = useAuth();
  const { colors } = useTheme();
  const canExport = canDoPageAction(user, access, "leads", "export") || canDoPageAction(user, access, "my_leads", "export");
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  /* Web "Export": the leads matching what is on screen, as a CSV with the web's columns. Capped so a phone never pulls the whole company. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: Lead[] = [];
      for (let next = 1; next <= 10; next += 1) {
        const { leads: chunk, pagination } = await listLeads({ page: next, limit: 100, search, status: filter === "DUE" ? undefined : filter, followUpDueOnly: filter === "DUE", extra: filterParams(filters) });
        rows.push(...chunk);
        if (!pagination?.hasNextPage) break;
      }
      const csv = toCsv([
        ["Name", "Phone", "Email", "Status", "City", "Assigned to", "Next follow-up"],
        ...rows.map((lead) => [lead.name, lead.phone, lead.email, statusMeta(lead.status).label, lead.city, lead.assignedTo?.name, lead.nextFollowUp ? formatDate(lead.nextFollowUp) : ""]),
      ]);
      await shareTextFile(datedFileName("leads"), csv);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="display">Leads</Text>
          <Text variant="small" color="muted">
            {total === null ? " " : `${total.toLocaleString("en-IN")} ${filtered ? "matching" : "in your pipeline"}`}
          </Text>
        </View>
        <HeaderButton icon="ellipsis-horizontal" label="More lead actions" variant="secondary" onPress={() => setMenuOpen(true)} />
        <View>
          <HeaderButton
            icon="options-outline"
            label={filterCount ? `Filters, ${filterCount} active` : "Filters"}
            variant="secondary"
            onPress={() => setFiltersOpen(true)}
          />
          {filterCount ? (
            <View style={[styles.filterBadge, { backgroundColor: colors.primary, borderColor: colors.bg }]} pointerEvents="none">
              <Text variant="tiny" color={colors.onPrimary}>
                {filterCount}
              </Text>
            </View>
          ) : null}
        </View>
        <HeaderButton icon="add" label="Add lead" onPress={() => navigation.navigate("AddLead")} />
      </View>
      <View style={styles.offline}>
        <OfflineBanner />
      </View>
      <View style={[styles.search, styles.searchRow]}>
        <View style={styles.flexMin}>
        <Field
          icon="search"
          surface
          compact
          value={query}
          onChangeText={setQuery}
          placeholder="Search leads"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        </View>
        <View style={styles.dropdown}>
          <FilterDropdown label="Show" icon="funnel-outline" options={[...FILTERS].map((item) => ({ ...item, label: item.key === "ALL" ? "All leads" : item.label }))} value={filter} onChange={setFilter} />
        </View>
      </View>
      <View style={styles.chips} />

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
      <ActionSheet
        visible={menuOpen}
        title="Leads"
        onClose={() => setMenuOpen(false)}
        actions={[
          ...(isManagement(user.role)
            ? [{ key: "team", label: "Team pipeline", icon: "people-outline" as const, onPress: () => navigation.navigate("TeamPipeline") }]
            : []),
          { key: "upload", label: "Bulk upload", hint: "Import leads from an Excel or CSV file", icon: "cloud-upload-outline" as const, onPress: () => navigation.navigate("BulkUpload") },
          ...(canExport
            ? [{ key: "export", label: exporting ? "Exporting…" : "Export CSV", hint: filtered ? "The leads matching your filters" : "Your pipeline, up to 1,000 leads", icon: "download-outline" as const, onPress: exportCsv }]
            : []),
        ]}
      />
      <LeadFiltersSheet
        visible={filtersOpen}
        value={filters}
        status={filter}
        onStatus={(next) => setFilter((FILTERS.some((item) => item.key === next) ? next : "ALL") as FilterKey)}
        canFilterAssignee={isManagement(user.role)}
        onApply={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  offline: { paddingTop: 10, marginBottom: -8 },
  root: { flex: 1 },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingTop: 4, gap: space.sm },
  search: { paddingHorizontal: gutter, paddingTop: 10 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  flexMin: { flex: 1, minWidth: 0 },
  dropdown: { width: 148 },
  filterBadge: { position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  chips: { height: 10 },
  list: { paddingHorizontal: gutter, paddingBottom: space.xxl },
  separator: { height: space.sm },
  more: { paddingVertical: space.lg },
});
