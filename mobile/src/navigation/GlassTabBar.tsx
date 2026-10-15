import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useAuth } from "../auth/AuthProvider";
import { canDoPageAction, canOpenPage } from "../api/access";
import { SitePhotoFlow, openSitePhoto } from "../components/SitePhotoFlow";
import { homeKindFor, ROLE_FAB, tabsFor, type TabName } from "../lib/roleHome";
import { useTabBadges } from "../lib/tabBadges";
import { useTheme } from "../theme/ThemeProvider";
import { ActionSheet, Icon, Text, type IconName, type SheetAction } from "../ui";

/*
 * "Home by Role" tab bar: a floating, translucent pill with the role's four
 * tabs (active one in a soft blue capsule, red count badges) and a round
 * button beside it for the role's main action.
 */
export const GlassTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const { user, access } = useAuth();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const badges = useTabBadges();
  const [createOpen, setCreateOpen] = useState(false);
  const kind = homeKindFor(user?.role);
  const routeNames = state.routes.map((route) => route.name);
  const tabs = tabsFor(kind, user, access).filter((tab) => routeNames.includes(tab.name));
  const current = state.routes[state.index]?.name as TabName;
  const fab = ROLE_FAB[kind];
  const createLead = canDoPageAction(user, access, "leads", "create") || canDoPageAction(user, access, "my_leads", "create");
  const createTask = canDoPageAction(user, access, "tasks", "create");
  const createChat = canDoPageAction(user, access, "chat", "create");
  const fabAllowed = ({
    admin: user?.role === "ADMIN",
    manager: createLead || createTask || createChat,
    sales: createLead || createTask || createChat,
    partner: createLead,
    field: canDoPageAction(user, access, "field_ops", "edit"),
    community: canDoPageAction(user, access, "coworking_booking", "create"),
    production: createTask,
  })[kind];
  const createActions: SheetAction[] = [
    createLead ? { key: "lead", icon: "person-add-outline", label: "New lead", onPress: () => navigation.navigate("AddLead" as never) } : null,
    createTask ? { key: "task", icon: "checkbox-outline", label: "New task", onPress: () => navigation.navigate("NewTask" as never) } : null,
    kind === "manager" && canOpenPage(user, access, "leads") ? { key: "pool", icon: "file-tray-full-outline", label: "Assign from lead pool", onPress: () => navigation.navigate("LeadPool" as never) } : null,
    kind === "manager" && createChat ? { key: "broadcast", icon: "megaphone-outline", label: "Broadcast to the team", onPress: () => navigation.navigate("Broadcast" as never) } : null,
    kind !== "manager" && createChat ? { key: "chat", icon: "chatbubble-outline", label: "New chat", onPress: () => navigation.navigate("NewChat" as never) } : null,
  ].filter(Boolean) as SheetAction[];
  const glass = scheme === "dark" ? "rgba(28,34,54,0.92)" : "rgba(255,255,255,0.94)";
  const glassLine = scheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(14,22,48,0.08)";

  const go = (name: TabName) => {
    const route = state.routes.find((item) => item.name === name);
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (current !== name && !event.defaultPrevented) navigation.navigate(name);
  };

  const onFab = () => {
    switch (kind) {
      case "admin":
        return navigation.navigate("Search" as never);
      case "manager":
      case "sales":
        return setCreateOpen(true);
      case "partner":
        return navigation.navigate("AddLead" as never);
      case "field":
        return openSitePhoto();
      case "community":
        return navigation.navigate("NewBooking" as never);
      case "production":
        return navigation.navigate("NewTask" as never);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
      <View style={styles.row}>
        <View style={[styles.bar, { backgroundColor: glass, borderColor: glassLine }]}>
          {tabs.map((tab) => {
            const active = current === tab.name;
            const badge = badges[tab.name] || 0;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={badge ? `${tab.label}, ${badge}` : tab.label}
                onPress={() => go(tab.name)}
                style={[styles.tab, active && { backgroundColor: colors.primarySoft }]}
              >
                <Icon name={(active ? tab.icon : `${tab.icon}-outline`) as IconName} size={22} color={active ? colors.primary : colors.textMuted} />
                <Text variant="tiny" color={active ? colors.primary : colors.textMuted} style={styles.label} numberOfLines={1} allowFontScaling={false}>
                  {tab.label}
                </Text>
                {badge ? (
                  <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                    <Text variant="tiny" color="#fff" style={styles.badgeText} allowFontScaling={false}>
                      {badge > 99 ? "99+" : badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {fabAllowed ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={fab.label}
          onPress={onFab}
          style={({ pressed }) => [styles.fab, { backgroundColor: glass, borderColor: glassLine }, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <Icon name={fab.icon} size={24} color={colors.text} />
        </Pressable> : null}
      </View>

      <ActionSheet
        visible={createOpen}
        title="Create"
        onClose={() => setCreateOpen(false)}
        actions={createActions}
      />
      {kind === "field" && fabAllowed ? <SitePhotoFlow /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  bar: {
    flex: 1,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 17, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 10 },
      default: { boxShadow: "0 12px 34px rgba(0,0,0,0.22)" } as object,
    }),
  },
  tab: { flex: 1, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", gap: 2 },
  label: { fontSize: 10, fontFamily: "PlusJakartaSans_700Bold" },
  badge: { position: "absolute", top: 6, left: "50%", marginLeft: 7, minWidth: 15, height: 15, paddingHorizontal: 4, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 9.5, lineHeight: 12, fontFamily: "PlusJakartaSans_800ExtraBold" },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 17, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 10 },
      default: { boxShadow: "0 12px 34px rgba(0,0,0,0.22)" } as object,
    }),
  },
});
