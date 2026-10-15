import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { listInventory, type Property } from "../../api/inventory";
import { listLeads } from "../../api/leads";
import type { Lead } from "../../api/types";
import { listUsers, type TeamUser } from "../../api/users";
import { roleLabel } from "../../lib/roles";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Field, GroupLabel, Icon, ListCard, Text } from "../../ui";

/* The admin's search button: people, leads and properties in one place. */
export const SearchScreen = ({ navigation }: RootScreenProps<"Search">) => {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<TeamUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listUsers()
      .then(setPeople)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setLeads([]);
      setProperties([]);
      return;
    }
    let alive = true;
    setBusy(true);
    const timer = setTimeout(() => {
      Promise.all([listLeads({ page: 1, limit: 8, search: needle }).then((r) => r.leads).catch(() => []), listInventory({ limit: 6, search: needle }).then((r) => r.items).catch(() => [])]).then(([l, p]) => {
        if (!alive) return;
        setLeads(l);
        setProperties(p);
        setBusy(false);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const matchedPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return people.filter((person) => `${person.name} ${person.email || ""} ${person.phone || ""}`.toLowerCase().includes(needle)).slice(0, 6);
  }, [people, query]);

  const nothing = query.trim().length >= 2 && !busy && !matchedPeople.length && !leads.length && !properties.length;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Field icon="search" surface value={query} onChangeText={setQuery} placeholder="People, leads or properties" autoFocus autoCorrect={false} />
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {query.trim().length < 2 ? (
        <Text variant="small" color="muted" align="center" style={styles.hint}>
          Type at least two letters — a name, phone number or project.
        </Text>
      ) : null}
      {matchedPeople.length ? (
        <Group title="People">
          {matchedPeople.map((person) => (
            <Row key={person._id} avatar={person.name} title={person.name} sub={roleLabel(person.role)} onPress={() => navigation.navigate("UserDetail", { id: person._id, name: person.name })} />
          ))}
        </Group>
      ) : null}
      {leads.length ? (
        <Group title="Leads">
          {leads.map((lead) => (
            <Row key={lead._id} avatar={lead.name} title={lead.name} sub={[lead.phone, lead.projectInterested].filter(Boolean).join(" · ")} onPress={() => navigation.navigate("LeadDetail", { leadId: lead._id, name: lead.name })} />
          ))}
        </Group>
      ) : null}
      {properties.length ? (
        <Group title="Properties">
          {properties.map((property) => (
            <Row
              key={property._id}
              icon="business"
              title={[property.towerName, property.projectName].filter(Boolean).join(" · ") || property.title || "Property"}
              sub={[property.location, property.city].filter(Boolean).join(" · ")}
              onPress={() => navigation.navigate("PropertyDetail", { id: property._id })}
            />
          ))}
        </Group>
      ) : null}
      {nothing ? (
        <Text variant="small" color="muted" align="center" style={styles.hint}>
          Nothing matches “{query.trim()}”.
        </Text>
      ) : null}
    </ScrollView>
  );
};

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.group}>
    <GroupLabel>{title}</GroupLabel>
    <ListCard>{children}</ListCard>
  </View>
);

const Row = ({ avatar, icon, title, sub, onPress }: { avatar?: string; icon?: "business"; title: string; sub?: string; onPress: () => void }) => {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {avatar ? (
        <Avatar name={avatar} size={36} tinted />
      ) : (
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={icon || "business"} size={17} color={colors.primary} />
        </View>
      )}
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {sub ? (
          <Text variant="small" color="muted" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={15} color={colors.textFaint} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  body: { padding: 16, gap: 14 },
  hint: { marginTop: 12 },
  group: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14 },
});
