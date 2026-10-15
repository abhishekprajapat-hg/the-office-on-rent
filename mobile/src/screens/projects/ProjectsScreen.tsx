import React, { useEffect, useLayoutEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { canManagePage } from "../../api/access";
import { humanize, listProjects, projectOccupancy, type Project } from "../../api/projects";
import { useAuth } from "../../auth/AuthProvider";
import { Icon } from "../../ui";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Badge, Body, Segmented, EmptyState, ErrorState, Field, IconTile, Loading, ProgressBar, Text } from "../../ui";

export const PROJECT_STATUS_TONE: Record<string, Tone> = {
  PRE_LAUNCH: "warning",
  TNC: "neutral",
  RERA_APPROVED: "primary",
  UNDER_CONSTRUCTION: "violet",
  READY_TO_MOVE: "success",
  RESALE: "neutral",
};

/* Design 26 - projects with occupancy bars. Web: modules/inventory/Projects. */
export const ProjectsScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user, access } = useAuth();
  const canCreate = canManagePage(user, access, "projects", "create");
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canCreate
        ? () => (
            <Pressable accessibilityRole="button" accessibilityLabel="New project" hitSlop={8} onPress={() => navigation.navigate("ProjectForm")}>
              <Icon name="add-circle" size={24} color={colors.primary} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canCreate, colors.primary]);
  const [category, setCategory] = useState<"ALL" | "COMMERCIAL" | "RESIDENTIAL">("ALL");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, loading, error, refreshing, refresh } = useQuery(
    () => listProjects({ ...(category !== "ALL" ? { projectCategory: category } : {}), ...(search.trim() ? { search: search.trim() } : {}) }),
    [category, search],
  );

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      <Field icon="search" surface compact value={query} onChangeText={setQuery} placeholder="Project, city or ID" autoCorrect={false} />
      <Segmented
        options={[
          { key: "ALL", label: "All" },
          { key: "COMMERCIAL", label: "Commercial" },
          { key: "RESIDENTIAL", label: "Residential" },
        ]}
        value={category}
        onChange={setCategory}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : data?.projects.length ? (
        data.projects.map((project) => <ProjectCard key={project._id} project={project} onPress={() => navigation.navigate("ProjectDetail", { id: project._id })} />)
      ) : (
        <EmptyState icon="business-outline" title={search ? "No projects match" : "No projects yet"} message="Projects added on the web show up here." />
      )}
      {colors ? null : null}
    </Body>
  );
};

const ProjectCard = ({ project, onPress }: { project: Project; onPress: () => void }) => {
  const { colors } = useTheme();
  const occ = projectOccupancy(project);
  const pct = occ && occ.total ? Math.round((occ.taken / occ.total) * 100) : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={project.projectName}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.head}>
        <IconTile icon="business" size={40} iconSize={19} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {project.projectName}
          </Text>
          <Text variant="small" color="muted" numberOfLines={1} style={styles.sub}>
            {[project.location || project.city, project.city && project.location ? project.city : "", humanize(project.projectType || project.projectCategory)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {project.status ? <Badge label={humanize(project.status)} tone={PROJECT_STATUS_TONE[project.status] || "neutral"} /> : null}
      </View>
      {occ ? (
        <View style={styles.occ}>
          <View style={styles.occHead}>
            <Text variant="small" color="muted" style={styles.sub}>
              {occ.taken} of {occ.total} {occ.noun} {occ.verb}
            </Text>
            <Text variant="smallStrong" style={styles.sub}>
              {pct}%
            </Text>
          </View>
          <ProgressBar value={pct / 100} />
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sub: { fontSize: 11.5 },
  occ: { gap: 5 },
  occHead: { flexDirection: "row", justifyContent: "space-between" },
});
