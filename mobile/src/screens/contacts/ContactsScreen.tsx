import React, { useEffect, useLayoutEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { errorMessage } from "../../api/client";
import { deleteContact, getBlockedLeads, listContacts, saveContact, type BlockedLead, type ContactKind, type CrmContact } from "../../api/contacts";
import { useUser } from "../../auth/AuthProvider";
import { dialable, formatDate, whatsappNumber } from "../../lib/format";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Body, Button, EmptyState, ErrorState, FactRow, Field, Icon, InlineError, ListCard, Loading, Segmented, Sheet, Text } from "../../ui";

const EMPTY = { name: "", phone: "", email: "", company: "", city: "", propertyDetails: "", notes: "" };

/* Design 25 - the owner & broker directory. Web: inventory/components/ContactDatabasePage. */
export const ContactsScreen = () => {
  const navigation = useNavigation();
  const user = useUser();
  const { colors } = useTheme();
  const [kind, setKind] = useState<ContactKind>("OWNER");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<CrmContact | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [owners, brokers] = await Promise.all([listContacts("OWNER", kind === "OWNER" ? search : ""), listContacts("BROKER", kind === "BROKER" ? search : "")]);
    return { owners, brokers };
  }, [kind, search]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel="Add contact" onPress={() => setAdding(true)} hitSlop={8}>
          <Icon name="add-circle" size={24} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);

  const list = kind === "OWNER" ? data?.owners : data?.brokers;

  return (
    <>
      <Body refreshing={refreshing} onRefresh={refresh}>
        <Segmented
          options={[
            { key: "OWNER", label: `Owners${data ? ` · ${data.owners.total}` : ""}` },
            { key: "BROKER", label: `Brokers${data ? ` · ${data.brokers.total}` : ""}` },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Field icon="search" surface compact value={query} onChangeText={setQuery} placeholder="Name, phone or company" autoCorrect={false} autoCapitalize="none" />
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : list?.contacts.length ? (
          <ListCard>
            {list.contacts.map((contact) => (
              <Pressable
                key={contact._id}
                onPress={() => setOpen(contact)}
                accessibilityRole="button"
                accessibilityLabel={contact.name}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={[styles.tile, { backgroundColor: kind === "OWNER" ? colors.violetSoft : colors.warningSoft }]}>
                  <Text variant="smallStrong" color={kind === "OWNER" ? colors.violet : colors.warning} style={styles.initials}>
                    {contact.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("")}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
                    {contact.name}
                  </Text>
                  <Text variant="small" color="muted" numberOfLines={1} style={styles.sub}>
                    {[
                      `${contact.inventoryIds?.length || 0} propert${contact.inventoryIds?.length === 1 ? "y" : "ies"}`,
                      contact.company,
                      contact.city,
                      kind === "BROKER" && contact.blockedLeadCount ? `${contact.blockedLeadCount} kept out` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`WhatsApp ${contact.name}`}
                  hitSlop={4}
                  onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(contact.phone)}`).catch(() => {})}
                  style={[styles.action, { backgroundColor: colors.successSoft }]}
                >
                  <Icon name="logo-whatsapp" size={15} color={colors.success} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${contact.name}`}
                  hitSlop={4}
                  onPress={() => Linking.openURL(`tel:${dialable(contact.phone)}`).catch(() => {})}
                  style={[styles.action, { backgroundColor: colors.primarySoft }]}
                >
                  <Icon name="call" size={14} color={colors.primary} />
                </Pressable>
              </Pressable>
            ))}
          </ListCard>
        ) : (
          <EmptyState
            icon={kind === "OWNER" ? "person-circle-outline" : "briefcase-outline"}
            title={search ? "No contacts match" : kind === "OWNER" ? "No owners yet" : "No brokers yet"}
            message={search ? "Try another name or number." : "Owners and brokers added here or from a property show up in this list."}
            actionLabel="Add contact"
            onAction={() => setAdding(true)}
          />
        )}
        {list && list.total > list.contacts.length ? (
          <Text variant="small" color="faint" align="center">
            Showing {list.contacts.length} of {list.total} — search to narrow down.
          </Text>
        ) : null}
      </Body>

      <ContactSheet contact={open} canDelete={isManagement(user.role)} onClose={() => setOpen(null)} onChanged={refresh} />
      <AddContactSheet visible={adding} kind={kind} onClose={() => setAdding(false)} onSaved={refresh} />
    </>
  );
};

const ContactSheet = ({ contact, canDelete, onClose, onChanged }: { contact: CrmContact | null; canDelete: boolean; onClose: () => void; onChanged: () => void }) => {
  const [blocked, setBlocked] = useState<BlockedLead[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setBlocked(null);
    setNotice(null);
    setError(null);
    setConfirm(false);
    if (contact?.kind === "BROKER" && contact.blockedLeadCount) getBlockedLeads(contact._id).then(setBlocked).catch(() => setBlocked([]));
  }, [contact]);
  if (!contact) return null;
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    try {
      const result = await deleteContact(contact._id);
      if (result.approvalRequired) setNotice(result.message || "Sent to an admin for approval.");
      else {
        onClose();
        onChanged();
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Sheet
      visible
      title={contact.name}
      subtitle={`${contact.kind === "BROKER" ? "Broker" : "Owner"} · ${contact.phone}`}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button label="Call" icon="call" variant="secondary" style={styles.flex} onPress={() => Linking.openURL(`tel:${dialable(contact.phone)}`).catch(() => {})} />
          <Button label="WhatsApp" icon="logo-whatsapp" style={styles.flex} onPress={() => Linking.openURL(`https://wa.me/${whatsappNumber(contact.phone)}`).catch(() => {})} />
        </View>
      }
    >
      <View>
        {contact.email ? <FactRow icon="mail-outline" label="Email" value={contact.email} /> : null}
        {contact.company ? <FactRow icon="business-outline" label="Company" value={contact.company} /> : null}
        {contact.city ? <FactRow icon="location-outline" label="City" value={contact.city} /> : null}
        <FactRow icon="cube-outline" label="Linked" value={`${contact.inventoryIds?.length || 0} properties · ${contact.leadIds?.length || 0} leads`} />
        {contact.createdAt ? <FactRow icon="calendar-outline" label="Added" value={formatDate(contact.createdAt)} /> : null}
      </View>
      {contact.propertyDetails ? (
        <View style={styles.block}>
          <Text variant="label" color="faint">
            Property details
          </Text>
          <Text variant="small">{contact.propertyDetails}</Text>
        </View>
      ) : null}
      {contact.notes ? (
        <View style={styles.block}>
          <Text variant="label" color="faint">
            Notes
          </Text>
          <Text variant="small">{contact.notes}</Text>
        </View>
      ) : null}
      {contact.kind === "BROKER" && contact.blockedLeadCount ? (
        <View style={styles.block}>
          <Text variant="label" color="faint">
            Leads kept out · {contact.blockedLeadCount}
          </Text>
          {blocked === null ? (
            <Loading />
          ) : (
            blocked.map((entry, index) => (
              <Text key={index} variant="small" color="muted">
                {[entry.name, entry.phone, entry.origin?.toLowerCase(), entry.at ? formatDate(entry.at) : ""].filter(Boolean).join(" · ")}
              </Text>
            ))
          )}
        </View>
      ) : null}
      {notice ? (
        <Text variant="small" color="primary">
          {notice}
        </Text>
      ) : null}
      <InlineError message={error} />
      {canDelete ? <Button label={confirm ? "Tap again to remove" : "Remove contact"} variant="danger" icon="trash-outline" size="sm" onPress={remove} /> : null}
    </Sheet>
  );
};

const AddContactSheet = ({ visible, kind: initialKind, onClose, onSaved }: { visible: boolean; kind: ContactKind; onClose: () => void; onSaved: () => void }) => {
  const [kind, setKind] = useState<ContactKind>(initialKind);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setKind(initialKind);
      setDraft(EMPTY);
      setError(null);
    }
  }, [visible, initialKind]);
  const set = (key: keyof typeof EMPTY) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!draft.name.trim()) return setError("Enter the contact's name.");
    if (draft.phone.replace(/\D/g, "").length < 10) return setError("Enter a valid phone number.");
    setSaving(true);
    setError(null);
    try {
      await saveContact({ kind, ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) } as Parameters<typeof saveContact>[0]);
      onClose();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      title="New contact"
      onClose={onClose}
      footer={
        <>
          <InlineError message={error} />
          <Button label="Save contact" loading={saving} onPress={save} />
        </>
      }
    >
      <Segmented
        options={[
          { key: "OWNER", label: "Owner" },
          { key: "BROKER", label: "Broker" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Field label="Name *" value={draft.name} onChangeText={set("name")} placeholder="Full name" autoCapitalize="words" />
      <Field label="Phone *" value={draft.phone} onChangeText={set("phone")} placeholder="9876543210" keyboardType="phone-pad" />
      <Field label="Email" value={draft.email} onChangeText={set("email")} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" />
      <Field label="Company / firm" value={draft.company} onChangeText={set("company")} placeholder={kind === "BROKER" ? "Brokerage name" : "Owning entity"} />
      <Field label="City" value={draft.city} onChangeText={set("city")} placeholder="Noida" />
      <Field label="Property details" value={draft.propertyDetails} onChangeText={set("propertyDetails")} placeholder="2 shops on MG Road, 1 office in Sector 62" multiline />
      <Field label="Notes" value={draft.notes} onChangeText={set("notes")} placeholder="Anything worth remembering before the next call" multiline />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: "PlusJakartaSans_800ExtraBold" },
  name: { fontSize: 13.5 },
  sub: { fontSize: 11.5 },
  action: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", gap: 8 },
  block: { gap: 4 },
});
