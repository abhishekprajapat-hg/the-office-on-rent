import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "../../api/client";
import { addLeadNote, getDiary, listLeads, updateLeadStatus, type DiaryEntry } from "../../api/leads";
import type { Lead } from "../../api/types";
import { DateTimeField } from "../../components/DateTimeField";
import { formatWhen } from "../../lib/format";
import { canScheduleFollowUp, defaultFollowUpOn, followUpQuickPicks, phoneSearch, toFollowUpPayload } from "../../lib/followUp";
import { statusMeta } from "../../lib/leadStatus";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar, Badge, Button, Field, Icon, InlineError, Select, Sheet, Text } from "../../ui";

/*
 * Schedule a follow-up for any lead from the calendar (web MasterSchedule
 * "Schedule follow-up"): find the lead by name or number, pick the time.
 * With a lead already given it reschedules that one.
 */
export const ScheduleFollowUpSheet = ({
  visible,
  day,
  lead: given,
  onClose,
  onSaved,
}: {
  visible: boolean;
  day: Date;
  lead?: Lead | null;
  onClose: () => void;
  onSaved: (at: Date) => void;
}) => {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const [lead, setLead] = useState<Lead | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLead(given || null);
    setAt(given?.nextFollowUp && new Date(given.nextFollowUp).getTime() > Date.now() ? new Date(given.nextFollowUp) : defaultFollowUpOn(day));
    setQuery("");
    setResults([]);
    setError(null);
  }, [visible, given, day]);

  useEffect(() => {
    if (!visible || lead) return undefined;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setSearching(true);
      listLeads({ page: 1, limit: 20, search: phoneSearch(text) })
        .then(({ leads }) => {
          if (alive) setResults(leads);
        })
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, visible, lead]);

  const save = async () => {
    if (!lead || !at) return setError("Pick a lead and a time.");
    if (!canScheduleFollowUp(lead)) return setError(`${lead.name} is ${statusMeta(lead.status).label.toLowerCase()}, so it takes no follow-up.`);
    setSaving(true);
    setError(null);
    try {
      // The status stays as it is; only the next follow-up moves.
      await updateLeadStatus(lead._id, { status: lead.status || "NEW", nextFollowUp: toFollowUpPayload(at) });
      onSaved(at);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={given ? "Reschedule follow-up" : "Schedule a follow-up"}
      subtitle={given ? given.name : "Find the lead by name or phone number."}
      onClose={onClose}
      footer={<Button label="Save follow-up" icon="alarm-outline" loading={saving} disabled={!lead || !at} onPress={save} />}
    >
      {lead ? (
        <View style={[styles.picked, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Avatar name={lead.name} size={34} />
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {lead.name}
            </Text>
            <Text variant="tiny" color="muted" numberOfLines={1}>
              {[lead.phone, statusMeta(lead.status).label, lead.nextFollowUp ? `now ${formatWhen(lead.nextFollowUp)}` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {!given ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Change lead" hitSlop={8} onPress={() => setLead(null)}>
              <Icon name="close-circle" size={20} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <Field value={query} onChangeText={setQuery} placeholder="Name or phone" icon="search" autoCapitalize="none" autoCorrect={false} />
          {searching ? (
            <Text variant="tiny" color="muted">
              Searching…
            </Text>
          ) : null}
          {results.slice(0, 6).map((row) => {
            const allowed = canScheduleFollowUp(row);
            return (
              <Pressable
                key={row._id}
                accessibilityRole="button"
                disabled={!allowed}
                onPress={() => setLead(row)}
                style={({ pressed }) => [styles.result, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, opacity: allowed ? 1 : 0.5 }]}
              >
                <Avatar name={row.name} size={30} />
                <View style={styles.flex}>
                  <Text variant="smallStrong" numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text variant="tiny" color="muted" numberOfLines={1}>
                    {[row.phone, row.assignedTo?.name].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Badge label={statusMeta(row.status).label} tone={statusMeta(row.status).tone} />
              </Pressable>
            );
          })}
          {query.trim().length >= 2 && !searching && !results.length ? (
            <Text variant="small" color="muted">
              No leads match.
            </Text>
          ) : null}
        </>
      )}
      <QuickPick at={at} onPick={setAt} />
      <DateTimeField label="Follow-up at" value={at} onChange={setAt} minimumDate={new Date()} />
      <InlineError message={error} />
    </Sheet>
  );
};

/* The follow-up shortcuts (in 2 hours, tomorrow 11 AM…) as one dropdown beside the exact time. */
const QuickPick = ({ at, onPick }: { at: Date | null; onPick: (date: Date) => void }) => {
  const picks = followUpQuickPicks();
  const current = picks.find((pick) => at && Math.abs(at.getTime() - pick.date.getTime()) < 60000);
  return (
    <Select
      label="Quick pick"
      placeholder="Choose a time"
      icon="flash-outline"
      options={picks.map((pick) => ({ key: pick.key, label: pick.label }))}
      value={current?.key || ""}
      onChange={(key) => {
        const pick = picks.find((item) => item.key === key);
        if (pick) onPick(pick.date);
      }}
    />
  );
};

/* A diary note on a follow-up's lead without leaving the calendar (web: the expanded follow-up's diary). */
export const FollowUpNoteSheet = ({ lead, onClose }: { lead: Lead | null; onClose: () => void }) => {
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNote("");
    setError(null);
    setSaved(false);
    setEntries([]);
    if (lead) getDiary(lead._id).then((rows) => setEntries(rows.slice(0, 3)), () => {});
  }, [lead]);

  const save = async () => {
    if (!lead || !note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addLeadNote(lead._id, note);
      setNote("");
      setSaved(true);
      setEntries((await getDiary(lead._id).catch(() => entries)).slice(0, 3));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={Boolean(lead)} title="Add a note" subtitle={lead?.name} onClose={onClose} footer={<Button label="Save note" icon="create-outline" loading={saving} disabled={!note.trim()} onPress={save} />}>
      <Field value={note} onChangeText={setNote} placeholder="What was discussed, what's next…" multiline maxLength={2000} />
      <InlineError message={error} />
      {saved ? (
        <Text variant="small" color="muted">
          Note saved.
        </Text>
      ) : null}
      {entries.map((entry) => (
        <View key={entry._id} style={styles.entry}>
          <Text variant="small">{entry.note}</Text>
          <Text variant="tiny" color="faint">
            {[entry.createdBy?.name || entry.author?.name, formatWhen(entry.createdAt)].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ))}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  picked: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 10 },
  result: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 8 },
  entry: { gap: 2 },
});
