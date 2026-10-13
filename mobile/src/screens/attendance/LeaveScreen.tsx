import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { applyLeave, getLeaveBalance, getMyLeaveRequests, LEAVE_TYPES } from "../../api/attendance";
import { errorMessage } from "../../api/client";
import { DateTimeField } from "../../components/DateTimeField";
import { daySpan, isoDay } from "../../lib/attendanceState";
import { formatDate } from "../../lib/format";
import { useQuery } from "../../lib/useQuery";
import { useTheme } from "../../theme/ThemeProvider";
import { space, toneColors, type Tone } from "../../theme/tokens";
import { Badge, Body, Button, Card, Chip, ErrorState, Field, InlineError, Loading, SectionTitle, Text } from "../../ui";

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

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {balance ? (
        <View style={styles.tiles}>
          <Tile label="Available" value={balance.available} tone="success" />
          <Tile label="Pending" value={balance.pending} tone="warning" />
          <Tile label="Used" value={balance.used} tone="neutral" />
        </View>
      ) : null}
      {balance?.monthlyAccrual ? (
        <Text variant="small" color="muted" align="center">
          You earn {balance.monthlyAccrual} day{balance.monthlyAccrual === 1 ? "" : "s"} of leave each month.
        </Text>
      ) : null}

      {sent && !applying ? (
        <Card style={[styles.sent, { backgroundColor: colors.successSoft }]}>
          <Text variant="smallStrong" color="primary">
            Leave request sent. Your manager will review it.
          </Text>
        </Card>
      ) : null}

      {applying ? (
        <Card style={styles.form}>
          <Text variant="heading">Apply for leave</Text>
          <View style={styles.chips}>
            {LEAVE_TYPES.map((item) => (
              <Chip key={item.key} label={item.label} selected={leaveType === item.key} onPress={() => setLeaveType(item.key)} />
            ))}
          </View>
          <DateTimeField
            label="From"
            mode="date"
            value={from}
            minimumDate={new Date()}
            onChange={(next) => {
              setFrom(next);
              if (next && to && to < next) setTo(next);
            }}
          />
          <DateTimeField label="To" mode="date" value={to} minimumDate={from || new Date()} onChange={setTo} />
          {days ? (
            <Text variant="small" color="muted">
              {days} day{days === 1 ? "" : "s"}
              {balance && days > balance.available && leaveType !== "UNPAID" ? ` · more than your ${balance.available} available` : ""}
            </Text>
          ) : null}
          <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Family function" multiline maxLength={500} />
          <InlineError message={formError} />
          <View style={styles.row}>
            <Button label="Cancel" variant="secondary" style={styles.flex} onPress={() => setApplying(false)} />
            <Button label="Send request" icon="send" style={styles.flex} loading={saving} onPress={submit} />
          </View>
        </Card>
      ) : (
        <Button
          label="Apply for leave"
          icon="add-circle-outline"
          onPress={() => {
            setSent(false);
            setFormError(null);
            setApplying(true);
          }}
        />
      )}

      <SectionTitle title="My requests" />
      {requests.length ? (
        <View style={styles.list}>
          {requests.map((request) => (
            <Card key={request._id} style={styles.request}>
              <View style={styles.requestHead}>
                <Text variant="bodyStrong" style={styles.flex}>
                  {formatDate(fromDay(request.fromDate))}
                  {request.toDate && request.toDate !== request.fromDate ? ` – ${formatDate(fromDay(request.toDate))}` : ""}
                </Text>
                <Badge label={sentenceCase(request.status)} tone={REQUEST_TONE[request.status || ""] || "neutral"} />
              </View>
              <Text variant="small" color="muted">
                {[TYPE_LABEL[request.leaveType || ""] || "Leave", request.totalDays ? `${request.totalDays} day${request.totalDays === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
              </Text>
              {request.reason ? (
                <Text variant="small" numberOfLines={3}>
                  {request.reason}
                </Text>
              ) : null}
              {request.reviewNote ? (
                <Text variant="small" color="muted">
                  Note: {request.reviewNote}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      ) : (
        <Card>
          <Text variant="small" color="muted">
            You haven't requested any leave yet.
          </Text>
        </Card>
      )}
    </Body>
  );
};

const Tile = ({ label, value, tone }: { label: string; value: number; tone: Tone }) => {
  const { colors } = useTheme();
  const { fg } = toneColors(colors, tone);
  return (
    <Card style={styles.tile}>
      <Text variant="display" color={tone === "neutral" ? colors.text : fg}>
        {value}
      </Text>
      <Text variant="small" color="muted">
        {label}
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tiles: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, alignItems: "center", gap: 2 },
  sent: { borderWidth: 0 },
  form: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", gap: space.md },
  list: { gap: space.sm },
  request: { gap: 4 },
  requestHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
