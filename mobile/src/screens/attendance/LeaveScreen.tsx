import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { applyLeave, getLeaveBalance, getMyLeaveRequests, LEAVE_TYPES } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import { DateTimeField } from "../../components/DateTimeField";
import { daySpan, isoDay } from "../../lib/attendanceState";
import { formatDate, formatDayShort } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { toneColors, type Tone } from "../../theme/tokens";
import { Badge, Body, Button, Chip, EmptyState, ErrorState, Field, GroupLabel, InlineError, ListCard, Loading, Sheet, Text } from "../../ui";

const REQUEST_TONE: Record<string, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };
const TYPE_LABEL: Record<string, string> = Object.fromEntries(LEAVE_TYPES.map((item) => [item.key, item.label]));

const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
};

const sentenceCase = (value?: string) => {
  const text = String(value || "").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/* Leave dates are whole days; a date-only value parsed as UTC would shift a day east of Greenwich. */
const fromDay = (value?: string) => (value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null);

export const LeaveScreen = () => {
  const { colors } = useTheme();
  const { data, loading, error, refreshing, refresh } = useQuery(async () => {
    const [balance, requests] = await Promise.all([getLeaveBalance(), getMyLeaveRequests()]);
    return { balance, requests };
  }, []);

  const [applying, setApplying] = useState(false);
  const [from, setFrom] = useState<Date | null>(tomorrow());
  const [to, setTo] = useState<Date | null>(tomorrow());
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error || "Couldn't load leave."} onRetry={refresh} />;

  const fromIso = from ? isoDay(from) : "";
  const toIso = to ? isoDay(to) : fromIso;
  const days = fromIso ? daySpan(fromIso, toIso) : 0;

  const submit = async () => {
    if (!fromIso) return setFormError("Pick the first day of your leave.");
    if (!days) return setFormError("The last day can't be before the first.");
    if (!reason.trim()) return setFormError("Add a short reason for your manager.");
    setSaving(true);
    setFormError(null);
    try {
      await applyLeave({ fromDate: fromIso, toDate: toIso, leaveType, reason: reason.trim() });
      setApplying(false);
      setReason("");
      setSent(true);
      refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const { balance, requests } = data;
  const openSheet = () => {
    setSent(false);
    setFormError(null);
    setApplying(true);
  };
  const rangeLabel = (fromValue?: string, toValue?: string) => {
    const start = fromDay(fromValue);
    const end = fromDay(toValue);
    if (!start) return "";
    if (!end || toValue === fromValue) return formatDayShort(start);
    return start.getMonth() === end.getMonth() ? `${start.getDate()}–${formatDate(end)}` : `${formatDate(start)} – ${formatDate(end)}`;
  };

  return (
    <>
      <Body refreshing={refreshing} onRefresh={refresh}>
        {balance ? (
          <View style={styles.tiles}>
            <Tile label="Available" hint="days left" value={balance.available} tone="primary" />
            <Tile label="Pending" hint="awaiting review" value={balance.pending} tone="violet" />
            <Tile label="Used" hint="this year" value={balance.used} tone="success" />
          </View>
        ) : null}
        {balance?.monthlyAccrual ? (
          <Text variant="small" color="muted" align="center">
            You earn {balance.monthlyAccrual} day{balance.monthlyAccrual === 1 ? "" : "s"} of leave each month · {balance.accrued} earned so far
          </Text>
        ) : null}

        <Button label="Apply for leave" icon="add-circle-outline" onPress={openSheet} />

        {sent ? (
          <View style={[styles.sent, { backgroundColor: colors.successSoft }]}>
            <Text variant="smallStrong" color={colors.success}>
              Leave request sent. Your manager will review it.
            </Text>
          </View>
        ) : null}

        <GroupLabel>My requests</GroupLabel>
        {requests.length ? (
          <ListCard>
            {requests.map((request) => {
              const days = Number(request.totalDays || 0);
              const type = TYPE_LABEL[request.leaveType || ""] || "Leave";
              const title = days === 0.5 ? "Half day" : `${type} leave · ${days} day${days === 1 ? "" : "s"}`;
              return (
                <View key={request._id} style={styles.request}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.reqTitle}>
                      {title}
                    </Text>
                    <Text variant="small" color="muted" style={styles.reqSub} numberOfLines={2}>
                      {[rangeLabel(request.fromDate, request.toDate), request.reason].filter(Boolean).join(" · ")}
                    </Text>
                    {request.reviewNote ? (
                      <Text variant="small" color="faint" style={styles.reqSub}>
                        Note: {request.reviewNote}
                      </Text>
                    ) : null}
                  </View>
                  <Badge label={sentenceCase(request.status)} tone={REQUEST_TONE[request.status || ""] || "neutral"} />
                </View>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState icon="airplane-outline" title="No leave requests yet" message="Requests you send show up here with their status." />
        )}
      </Body>

      <Sheet
        visible={applying}
        title="Apply for leave"
        onClose={() => setApplying(false)}
        footer={
          <>
            <InlineError message={formError} />
            <Button label={days ? `Send request · ${days} day${days === 1 ? "" : "s"}` : "Send request"} loading={saving} onPress={submit} />
          </>
        }
      >
        <View style={styles.chips}>
          {LEAVE_TYPES.map((item) => (
            <Chip key={item.key} label={item.label} selected={leaveType === item.key} onPress={() => setLeaveType(item.key)} />
          ))}
        </View>
        <View style={styles.dates}>
          <View style={styles.flex}>
            <DateTimeField
              label="From"
              variant="tile"
              mode="date"
              value={from}
              minimumDate={new Date()}
              onChange={(next) => {
                setFrom(next);
                if (next && to && to < next) setTo(next);
              }}
            />
          </View>
          <View style={styles.flex}>
            <DateTimeField label="To" variant="tile" mode="date" value={to} minimumDate={from || new Date()} onChange={setTo} />
          </View>
        </View>
        {balance && days > balance.available && leaveType !== "UNPAID" ? (
          <Text variant="small" color={colors.warning}>
            That's more than your {balance.available} available day{balance.available === 1 ? "" : "s"}.
          </Text>
        ) : null}
        <Field value={reason} onChangeText={setReason} placeholder="Reason, e.g. Family function" multiline maxLength={500} />
      </Sheet>
    </>
  );
};

const Tile = ({ label, hint, value, tone }: { label: string; hint: string; value: number; tone: Tone }) => {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Text variant="stat" color={fg} style={styles.tileValue}>
        {String(value ?? 0)}
      </Text>
      <Text variant="smallStrong" color={fg} style={styles.tileLabel}>
        {label}
      </Text>
      <Text variant="tiny" color={fg} style={styles.tileHint}>
        {hint}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 12, gap: 2 },
  tileValue: { fontSize: 24, lineHeight: 30 },
  tileLabel: { fontSize: 11.5 },
  tileHint: { opacity: 0.75, fontFamily: "PlusJakartaSans_400Regular" },
  sent: { borderRadius: 14, padding: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dates: { flexDirection: "row", gap: 8 },
  request: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  reqTitle: { fontSize: 13 },
  reqSub: { fontSize: 11.5 },
});
