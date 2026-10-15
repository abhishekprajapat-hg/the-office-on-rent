import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useUser } from "../../auth/AuthProvider";
import { useAuth } from "../../auth/AuthProvider";
import { canDoPageAction, canOpenPage } from "../../api/access";
import { initials } from "../../lib/format";
import { roleLabel } from "../../lib/roles";
import { useFeed } from "../../notifications/feed";
import { useTheme } from "../../theme/ThemeProvider";
import type { Palette } from "../../theme/tokens";
import { Avatar, Icon, Text, type IconName } from "../../ui";

/* Tones as the design names them (TN in "Home by Role"). */
export type HomeTone = "blue" | "ok" | "warn" | "bad" | "mut" | "vio";
export const tone = (c: Palette, t: HomeTone) =>
  ({
    blue: { fg: c.primary, bg: c.primarySoft },
    ok: { fg: c.success, bg: c.successSoft },
    warn: { fg: c.warning, bg: c.warningSoft },
    bad: { fg: c.danger, bg: c.dangerSoft },
    mut: { fg: c.textMuted, bg: c.surfaceAlt },
    vio: { fg: c.violet, bg: c.violetSoft },
  })[t];

/* Bar colours on the blue hero. */
export const HERO = { white: "#ffffff", dim: "rgba(255,255,255,0.55)", gold: "#ffcf5a", sky: "#9fb3ff", coral: "#ff8a80" };

export type HeroSpec = {
  page?: string;
  icon: IconName;
  label: string;
  tag?: string;
  value: string;
  unit?: string;
  bar: { label: string; value: number; color: string; display?: string }[];
  cta?: { label: string; icon: IconName; onPress: () => void; busy?: boolean; disabled?: boolean; page?: string; action?: string };
};
export type ActionSpec = { icon: IconName; label: string; onPress: () => void; page?: string; action?: string };
export type StatSpec = { icon: IconName; value: string; label: string; tone: HomeTone; onPress?: () => void; page?: string };
export type RowSpec = {
  key: string;
  page?: string;
  /* Initials (or a step number) in a tinted tile, or an icon. */
  avatar?: string;
  icon?: IconName;
  tone: HomeTone;
  title: string;
  sub?: string;
  right?: string;
  rightTone?: HomeTone;
  onPress?: () => void;
  onRight?: () => void;
};
export type SectionSpec = { title: string; link?: string; onLink?: () => void; empty?: string; rows?: RowSpec[]; loading?: boolean; page?: string; linkPage?: string };

/*
 * The shared home layout from "Home by Role": greeting header with the bell,
 * the blue hero card, four quick actions, a 2×2 of stats and titled sections.
 */
export const RoleHome = ({
  loading,
  refreshing,
  onRefresh,
  hero,
  actions,
  stats,
  sections,
  footer,
  showNotifications = true,
}: {
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  hero: HeroSpec | null;
  actions: ActionSpec[];
  stats: StatSpec[];
  sections: SectionSpec[];
  footer?: React.ReactNode;
  showNotifications?: boolean;
}) => {
  const user = useUser();
  const { access } = useAuth();
  const permitted = (page?: string, action?: string) => !page || (action ? canDoPageAction(user, access, page, action) : canOpenPage(user, access, page));
  const visibleHero = hero && permitted(hero.page) ? { ...hero, cta: hero.cta && permitted(hero.cta.page, hero.cta.action) ? hero.cta : undefined } : null;
  const visibleActions = actions.filter((item) => permitted(item.page, item.action));
  const visibleStats = stats.filter((item) => permitted(item.page));
  const visibleSections = sections.filter((section) => permitted(section.page)).map((section) => ({
    ...section,
    rows: section.rows?.filter((row) => permitted(row.page)),
    link: permitted(section.linkPage) ? section.link : undefined,
    onLink: permitted(section.linkPage) ? section.onLink : undefined,
  }));
  const navigation = useNavigation();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const unread = useFeed().filter((item) => !item.read).length;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {focused ? <StatusBar style={scheme === "dark" ? "light" : "dark"} /> : null}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => navigation.navigate("Profile")} style={[styles.me, { backgroundColor: colors.primary }]}>
            {user.profileImageUrl ? (
              <Avatar name={user.name} uri={user.profileImageUrl} size={44} />
            ) : (
              <Text variant="bodyStrong" color={colors.onPrimary} style={styles.meText}>
                {initials(user.name)}
              </Text>
            )}
          </Pressable>
          <View style={styles.flex}>
            <Text variant="small" color="muted" numberOfLines={1} style={styles.when}>
              {roleLabel(user.role)} · {today}
            </Text>
            <Text variant="title" numberOfLines={1} style={styles.hi}>
              Hi, {String(user.name || "").split(" ")[0] || "there"}
            </Text>
          </View>
          {showNotifications ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
            onPress={() => navigation.navigate("Notifications")}
            style={[styles.bell, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Icon name="notifications-outline" size={19} color={colors.text} />
            {unread ? <View style={[styles.bellDot, { backgroundColor: colors.danger, borderColor: colors.surface }]} /> : null}
          </Pressable> : null}
        </View>

        {visibleHero ? <Hero spec={visibleHero} /> : loading ? <View style={[styles.heroLoading, { backgroundColor: colors.hero }]}><ActivityIndicator color="#fff" /></View> : null}

        {visibleActions.length ? (
          <View style={styles.actions}>
            {visibleActions.map((action) => (
              <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <View style={[styles.actionTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Icon name={action.icon} size={22} color={colors.primary} />
                </View>
                <Text variant="tiny" color="muted" align="center" numberOfLines={2} style={styles.actionLabel}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {visibleStats.length ? (
          <View style={styles.stats}>
            {visibleStats.map((stat) => {
              const t = tone(colors, stat.tone);
              return (
                <Pressable
                  key={stat.label}
                  disabled={!stat.onPress}
                  onPress={stat.onPress}
                  accessibilityRole={stat.onPress ? "button" : undefined}
                  accessibilityLabel={`${stat.label}: ${stat.value}`}
                  style={({ pressed }) => [styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
                >
                  <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
                    <Icon name={stat.icon} size={17} color={t.fg} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="title" numberOfLines={1} style={styles.statValue}>
                      {loading && stat.value === "–" ? "…" : stat.value}
                    </Text>
                    <Text variant="tiny" color="muted" numberOfLines={1} style={styles.statLabel}>
                      {stat.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {visibleSections.map((section) => (
          <Section key={section.title} spec={section} />
        ))}
        {footer}
      </ScrollView>
    </View>
  );
};

const Hero = ({ spec }: { spec: HeroSpec }) => {
  const { colors } = useTheme();
  const total = spec.bar.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  return (
    <View style={[styles.hero, { backgroundColor: colors.hero, shadowColor: colors.hero }]}>
      <View style={styles.heroHead}>
        <View style={styles.heroIcon}>
          <Icon name={spec.icon} size={16} color="#fff" />
        </View>
        <Text variant="smallStrong" color={colors.onPrimaryMuted} numberOfLines={1} style={[styles.flex, styles.heroLabel]}>
          {spec.label}
        </Text>
        {spec.tag ? (
          <View style={styles.heroTag}>
            <Text variant="tiny" color="#fff" style={styles.heroTagText} numberOfLines={1}>
              {spec.tag}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.heroValueRow}>
        <Text color="#fff" numberOfLines={1} adjustsFontSizeToFit style={[styles.heroValue, spec.value.length > 14 ? styles.heroValueS : spec.value.length > 8 ? styles.heroValueM : null]}>
          {spec.value}
        </Text>
        {spec.unit ? (
          <Text variant="smallStrong" color={colors.onPrimaryMuted} style={styles.heroUnit}>
            {spec.unit}
          </Text>
        ) : null}
      </View>
      {spec.bar.length ? (
        <>
          <View style={styles.bar}>
            {total > 0 ? (
              spec.bar.filter((part) => part.value > 0).map((part) => <View key={part.label} style={[styles.barPart, { flex: part.value, backgroundColor: part.color }]} />)
            ) : (
              <View style={[styles.barPart, { flex: 1, backgroundColor: "rgba(255,255,255,0.12)" }]} />
            )}
          </View>
          <View style={styles.legend}>
            {spec.bar.map((part) => (
              <View key={part.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: part.color }]} />
                <Text variant="tiny" color="#dfe6fd" style={styles.legendText}>
                  {part.label} {part.display ?? part.value}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {spec.cta ? (
        <Pressable
          accessibilityRole="button"
          disabled={spec.cta.busy || spec.cta.disabled}
          onPress={spec.cta.onPress}
          style={({ pressed }) => [styles.cta, (pressed || spec.cta?.disabled) && { opacity: spec.cta?.disabled ? 0.6 : 0.9, transform: [{ scale: 0.98 }] }]}
        >
          {spec.cta.busy ? <ActivityIndicator color={colors.primary} /> : <Icon name={spec.cta.icon} size={17} color={colors.hero} />}
          <Text variant="bodyStrong" color={colors.hero} style={styles.ctaText} numberOfLines={1}>
            {spec.cta.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const Section = ({ spec }: { spec: SectionSpec }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="heading" style={styles.sectionTitle}>
          {spec.title}
        </Text>
        {spec.link ? (
          <Pressable accessibilityRole="button" onPress={spec.onLink} hitSlop={8}>
            <Text variant="smallStrong" color="primary">
              {spec.link}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {spec.loading ? (
        <View style={[styles.rows, styles.rowsLoading, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : spec.rows?.length ? (
        <View style={[styles.rows, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {spec.rows.map((row, index) => {
            const t = tone(colors, row.tone);
            const r = tone(colors, row.rightTone || row.tone);
            return (
              <Pressable
                key={row.key}
                disabled={!row.onPress}
                onPress={row.onPress}
                accessibilityRole={row.onPress ? "button" : undefined}
                style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={[styles.rowTile, { backgroundColor: row.icon ? t.bg : colors.primarySoft }]}>
                  {row.icon ? (
                    <Icon name={row.icon} size={17} color={t.fg} />
                  ) : (
                    <Text variant="smallStrong" color={colors.primary} style={styles.rowInitials}>
                      {row.avatar}
                    </Text>
                  )}
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.rowTitle}>
                    {row.title}
                  </Text>
                  {row.sub ? (
                    <Text variant="small" color="muted" numberOfLines={1}>
                      {row.sub}
                    </Text>
                  ) : null}
                </View>
                {row.right ? (
                  <Pressable disabled={!row.onRight} onPress={row.onRight} hitSlop={6} accessibilityRole={row.onRight ? "button" : undefined} accessibilityLabel={row.onRight ? `${row.right} ${row.title}` : undefined} style={[styles.pill, { backgroundColor: r.bg }]}>
                    <Text variant="tiny" color={r.fg} style={styles.pillText}>
                      {row.right}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : spec.empty ? (
        <View style={[styles.empty, { backgroundColor: colors.successSoft }]}>
          <Icon name="checkmark-done-circle" size={20} color={colors.success} />
          <Text variant="smallStrong" color={colors.success} style={styles.flex}>
            {spec.empty}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  me: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  meText: { fontSize: 15, fontFamily: "PlusJakartaSans_800ExtraBold" },
  when: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  hi: { fontSize: 22, lineHeight: 28 },
  bell: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  bellDot: { position: "absolute", top: 9, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  heroLoading: { height: 230, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  hero: { borderRadius: 26, padding: 18, gap: 14, shadowOpacity: 0.28, shadowRadius: 17, shadowOffset: { width: 0, height: 14 }, elevation: 6 },
  heroHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  heroLabel: { fontSize: 13 },
  heroTag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.16)", maxWidth: 150 },
  heroTagText: { fontSize: 11, fontFamily: "PlusJakartaSans_700Bold" },
  heroValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  heroValue: { flexShrink: 1, fontSize: 40, lineHeight: 44, fontFamily: "PlusJakartaSans_800ExtraBold", letterSpacing: -1.2 },
  heroValueM: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  heroValueS: { fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  heroUnit: { fontSize: 14, paddingBottom: 6, flexShrink: 1 },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 3, backgroundColor: "rgba(255,255,255,0.12)" },
  barPart: { borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: 11.5, fontFamily: "PlusJakartaSans_600SemiBold" },
  cta: { height: 46, borderRadius: 15, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  ctaText: { fontSize: 14, fontFamily: "PlusJakartaSans_800ExtraBold" },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, alignItems: "center", gap: 6 },
  actionTile: { width: 56, height: 56, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, lineHeight: 13, fontFamily: "PlusJakartaSans_700Bold" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { flexBasis: "46%", flexGrow: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14 },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 19, lineHeight: 22 },
  statLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  section: { gap: 10 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { fontSize: 16 },
  rows: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  rowsLoading: { paddingVertical: 22, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowTile: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rowInitials: { fontSize: 12.5, fontFamily: "PlusJakartaSans_800ExtraBold" },
  rowTitle: { fontSize: 14 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 12, fontFamily: "PlusJakartaSans_800ExtraBold" },
  empty: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
});
