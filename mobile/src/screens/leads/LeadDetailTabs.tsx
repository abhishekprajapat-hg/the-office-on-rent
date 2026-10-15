import React, { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { errorMessage, mediaUrl } from "../../api/client";
import { getProperty, type Property } from "../../api/inventory";
import { addLeadNote, selectLinkedProperty, unlinkProperty, type DiaryEntry, type LeadActivity, type LeadDetail } from "../../api/leads";
import type { PersonRef, Task } from "../../api/types";
import { TaskRow } from "../../components/TaskRow";
import { sortTasks } from "../../lib/taskMeta";
import { formatDate, formatWhen, isOverdue } from "../../lib/format";
import { formatRupees } from "../../lib/money";
import { ProposalSheet } from "./ProposalSheet";
import { logModeOf, matchesTimeline, withLogMode, type LogMode, type TimelineFilter } from "../../lib/leadLog";
import { areaRangeLabel, budgetLabel, missingDetails, requirementSummary } from "../../lib/leadDepth";
import { LEAD_STAGES, statusMeta, statusStage } from "../../lib/leadStatus";
import { INVENTORY_STATUS, priceLine, propertyTitle, FURNISHING } from "../../lib/property";
import { roleLabel } from "../../lib/roles";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Avatar, Badge, Button, Card, Chip, Field, Icon, InlineError, Loading, SectionTitle, Segmented, Text, type IconName } from "../../ui";

const SOURCE_LABELS: Record<string, string> = {
  META: "Meta ads",
  JUSTDIAL: "JustDial",
  OLX: "OLX",
  MYBRICKS: "MyBricks",
  "99ACRES": "99acres",
  WEBSITE: "Website",
  REFERENCE: "Reference",
  BROKER: "Broker",
  DIRECT_CALL: "Direct call",
  DIRECT_VISIT: "Direct visit",
  MANUAL: "Added manually",
};

const idOf = (value: string | { _id: string } | null | undefined) => (typeof value === "string" ? value : value?._id || "");

/* ------------------------------------------------------------- overview -- */

export const LeadOverviewTab = ({ lead, onEditRequirements, onOpenProperties }: { lead: LeadDetail; onEditRequirements: () => void; onOpenProperties: () => void }) => {
  const { colors } = useTheme();
  // A closed deal paid in part keeps one follow-up: collecting the rest (web "Remaining payment follow-up").
  const collecting = String(lead.status || "").toUpperCase() === "CLOSED" && String(lead.dealPayment?.paymentType || "").toUpperCase() === "PARTIAL";
  const remaining = Number(lead.dealPayment?.remainingAmount) > 0 ? Number(lead.dealPayment?.remainingAmount) : null;
  const linkedCount = (lead.relatedInventoryIds || []).length;
  const visitStage = ["INTERESTED", "SITE_VISIT_SCHEDULED", "SITE_VISIT", "CONTACTED", "NEW"].includes(String(lead.status || "").toUpperCase());
  const stage = statusStage(lead.status);
  const stageIndex = stage ? LEAD_STAGES.findIndex((item) => item.key === stage) : -1;
  const overdue = isOverdue(lead.nextFollowUp);
  const missing = missingDetails(lead);
  const summary = requirementSummary(lead.requirements);

  return (
    <>
      <Card style={styles.gapSm}>
        <View style={styles.stepper}>
          {LEAD_STAGES.map((item, index) => {
            const reached = stageIndex >= index;
            return (
              <View key={item.key} style={styles.step}>
                <View style={styles.stepTrack}>
                  <View style={[styles.stepLine, { backgroundColor: index === 0 ? "transparent" : stageIndex >= index ? colors.primary : colors.border }]} />
                  <View style={[styles.stepDot, { backgroundColor: reached ? colors.primary : colors.surface, borderColor: reached ? colors.primary : colors.border }]}>
                    {reached ? <Icon name="checkmark" size={12} color={colors.onPrimary} /> : null}
                  </View>
                  <View
                    style={[styles.stepLine, { backgroundColor: index === LEAD_STAGES.length - 1 ? "transparent" : stageIndex > index ? colors.primary : colors.border }]}
                  />
                </View>
                <Text variant="tiny" color={stageIndex === index ? "primary" : "faint"} align="center" numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>
        {stageIndex < 0 ? (
          <Text variant="small" color="muted" align="center">
            Marked {statusMeta(lead.status).label.toLowerCase()} — off the sales path.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.inlineCard}>
        <View style={[styles.squareIcon, { backgroundColor: overdue ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name="alarm" size={20} color={overdue ? colors.danger : colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text variant="small" color="muted">
            {collecting ? "Remaining payment follow-up" : "Next follow-up"}
          </Text>
          <Text variant="bodyStrong" color={overdue ? colors.danger : colors.text}>
            {lead.nextFollowUp ? `${formatWhen(lead.nextFollowUp)}${overdue ? " · overdue" : ""}` : "Not scheduled"}
          </Text>
          {collecting ? (
            <Text variant="small" color="muted">
              Collect the pending amount{remaining ? ` (${formatRupees(remaining)})` : ""}.
            </Text>
          ) : null}
          {lead.followUpPurpose ? (
            <Text variant="small" color="muted" numberOfLines={2}>
              {lead.followUpPurpose}
            </Text>
          ) : null}
        </View>
      </Card>

      {summary ? (
        <Card onPress={onEditRequirements} style={styles.inlineCard} accessibilityLabel="Requirements">
          <View style={[styles.squareIcon, { backgroundColor: colors.infoSoft }]}>
            <Icon name="search" size={20} color={colors.info} />
          </View>
          <View style={styles.flex}>
            <Text variant="small" color="muted">
              Looking for
            </Text>
            <Text variant="bodyStrong">{summary}</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      ) : null}

      {visitStage ? (
        <Card onPress={onOpenProperties} style={styles.inlineCard} accessibilityLabel="Site visit">
          <View style={[styles.squareIcon, { backgroundColor: colors.violetSoft }]}>
            <Icon name="navigate" size={20} color={colors.violet} />
          </View>
          <View style={styles.flex}>
            <Text variant="small" color="muted">
              Site visit
            </Text>
            <Text variant="bodyStrong">{lead.inventoryId ? "Property chosen" : linkedCount ? `${linkedCount} linked, none chosen` : "No property linked"}</Text>
            <Text variant="small" color="muted">
              {lead.inventoryId ? "Mark it visited from Update status." : "Link and choose a property to schedule a visit."}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      ) : null}

      {missing.length ? (
        <Card style={[styles.gapSm, { backgroundColor: colors.warningSoft, borderWidth: 0 }]}>
          <Text variant="smallStrong" color={colors.warning}>
            Still to find out
          </Text>
          <View style={styles.chips}>
            {missing.map((item) => (
              <View key={item} style={[styles.missing, { borderColor: colors.warning }]}>
                <Text variant="tiny" color={colors.warning}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <SectionTitle title="Contact details" />
      <Card style={styles.rows}>
        <InfoRow icon="mail-outline" label="Email" value={lead.email} />
        <InfoRow icon="location-outline" label="City" value={lead.city} />
        <InfoRow icon="map-outline" label="Prefers" value={(lead.preferredLocations || []).join(", ")} />
        <InfoRow icon="business-outline" label="Company" value={lead.company} />
        <InfoRow icon="briefcase-outline" label="Profession" value={lead.clientProfession} />
        <InfoRow icon="home-outline" label="Project" value={lead.projectInterested} />
        <InfoRow icon="megaphone-outline" label="Source" value={SOURCE_LABELS[lead.sourceChannel || ""] || SOURCE_LABELS[lead.source || ""]} />
        <InfoRow icon="calendar-outline" label="Added" value={formatDate(lead.createdAt)} last />
      </Card>

      <SectionTitle title="Team" />
      <Card style={styles.rows}>
        <PersonRow label="Current owner" person={lead.assignedTo || lead.assignedExecutive} />
        <PersonRow label="Executive" person={lead.assignedExecutive} />
        <PersonRow label="Manager" person={lead.assignedManager} />
        <PersonRow label="Field executive" person={lead.assignedFieldExecutive} last />
      </Card>
    </>
  );
};

/* --------------------------------------------------------- requirements -- */

const TYPE: Record<string, string> = { COMMERCIAL: "Commercial", RESIDENTIAL: "Residential", COWORKING: "Coworking" };
const DEAL: Record<string, string> = { SALE: "Buy", RENT: "Rent", LEASE: "Lease" };

export const LeadRequirementsTab = ({ lead, onEdit }: { lead: LeadDetail; onEdit: () => void }) => {
  const req = lead.requirements || {};
  const commercial = req.commercial || {};
  const amenities = Object.entries({ ...(req.residential?.amenities || {}), ...commercial })
    .filter(([, value]) => value === true)
    .map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
  const empty = !req.inventoryType && !req.transactionType && !req.budgetMin && !req.budgetMax;

  return (
    <>
      <Card style={styles.rows}>
        <InfoRow icon="business-outline" label="Type" value={TYPE[req.inventoryType || ""]} />
        <InfoRow icon="swap-horizontal-outline" label="Wants to" value={DEAL[req.transactionType || ""]} />
        <InfoRow icon="pricetag-outline" label="Kind" value={[req.residential?.bhkType, req.propertySubtype].filter(Boolean).join(" · ")} />
        <InfoRow icon="cash-outline" label="Budget" value={budgetLabel(req.budgetMin, req.budgetMax)} />
        <InfoRow icon="resize-outline" label="Area" value={areaRangeLabel(req.areaMin, req.areaMax, req.areaUnit === "SQ_M" ? "sq m" : "sq ft")} />
        <InfoRow icon="color-palette-outline" label="Furnishing" value={FURNISHING[req.furnishingStatus || ""]} />
        {req.inventoryType === "COMMERCIAL" ? (
          <InfoRow
            icon="people-outline"
            label="Space"
            value={[commercial.seats ? `${commercial.seats} seats` : "", commercial.cabins ? `${commercial.cabins} cabins` : "", commercial.conferenceRooms ? `${commercial.conferenceRooms} conference` : ""]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : null}
        {req.inventoryType === "RESIDENTIAL" && req.residential?.floor != null ? <InfoRow icon="layers-outline" label="Floor" value={String(req.residential.floor)} /> : null}
        <InfoRow icon="map-outline" label="Locations" value={(lead.preferredLocations || []).join(", ")} last />
      </Card>
      {amenities.length ? (
        <>
          <SectionTitle title="Must have" />
          <View style={styles.chips}>
            {amenities.map((label) => (
              <Badge key={label} label={label} tone="primary" />
            ))}
          </View>
        </>
      ) : null}
      {empty ? (
        <Text variant="small" color="muted" align="center">
          No requirements captured yet.
        </Text>
      ) : null}
      <Button label={empty ? "Add requirements" : "Edit requirements"} icon="options-outline" variant="secondary" onPress={onEdit} />
    </>
  );
};

/* ------------------------------------------------------------ properties -- */

export const LeadPropertiesTab = ({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const ids = (lead.relatedInventoryIds || []).map(idOf).filter(Boolean);
  const selectedId = idOf(lead.inventoryId);
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [proposalOpen, setProposalOpen] = useState(false);

  const idKey = ids.join(",");
  useEffect(() => {
    let alive = true;
    setProperties(null);
    Promise.all(ids.map((id) => getProperty(id).catch(() => null))).then((rows) => {
      if (alive) setProperties(rows.filter(Boolean) as Property[]);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (properties === null && ids.length) return <Loading />;

  return (
    <>
      <InlineError message={error} />
      {(properties || []).length ? (
        (properties || []).map((property) => {
          const isSelected = property._id === selectedId;
          const isPicked = picked.includes(property._id);
          const status = INVENTORY_STATUS[property.status || ""];
          return (
            <Card key={property._id} style={[styles.gapSm, isSelected && { borderColor: colors.primary, borderWidth: 1.5 }]}>
              <View style={styles.propertyRow}>
                {property.images?.[0] ? (
                  <Image source={{ uri: mediaUrl(property.images[0]) }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: colors.surfaceAlt }]}>
                    <Icon name="business-outline" size={20} color={colors.textFaint} />
                  </View>
                )}
                <View style={styles.flex}>
                  <Text variant="smallStrong" numberOfLines={2}>
                    {propertyTitle(property)}
                  </Text>
                  <Text variant="small" color="primary">
                    {priceLine(property)}
                  </Text>
                  <View style={styles.chips}>
                    {isSelected ? <Badge label="Selected" tone="primary" /> : null}
                    {status ? <Badge label={status.label} tone={status.tone} /> : null}
                  </View>
                </View>
                <Button
                  label=""
                  accessibilityLabel={isPicked ? "Remove from proposal" : "Add to proposal"}
                  icon={isPicked ? "checkbox" : "square-outline"}
                  size="sm"
                  variant="ghost"
                  onPress={() => setPicked((list) => (isPicked ? list.filter((id) => id !== property._id) : [...list, property._id]))}
                />
              </View>
              <View style={styles.row}>
                <Button label="Open" size="sm" variant="secondary" icon="open-outline" onPress={() => navigation.navigate("PropertyDetail", { id: property._id })} />
                {!isSelected ? (
                  <Button label="Mark selected" size="sm" variant="secondary" icon="star-outline" loading={busy === `sel-${property._id}`} onPress={() => act(`sel-${property._id}`, () => selectLinkedProperty(lead._id, property._id))} />
                ) : null}
                <Button label="" accessibilityLabel="Remove property" size="sm" variant="danger" icon="close" loading={busy === `rm-${property._id}`} onPress={() => act(`rm-${property._id}`, () => unlinkProperty(lead._id, property._id))} />
              </View>
            </Card>
          );
        })
      ) : (
        <Card>
          <Text variant="small" color="muted">
            No properties linked yet. Link the ones you've shown or plan to show.
          </Text>
        </Card>
      )}
      <Button label="Link a property" icon="link-outline" variant="secondary" onPress={() => navigation.navigate("PickProperty", { leadId: lead._id })} />
      {(properties || []).length ? (
        <Button
          label={picked.length ? `Send proposal (${picked.length})` : "Tick properties to send a proposal"}
          icon="document-text-outline"
          disabled={!picked.length}
          onPress={() => setProposalOpen(true)}
        />
      ) : null}
      <ProposalSheet visible={proposalOpen} lead={lead} properties={(properties || []).filter((property) => picked.includes(property._id))} onClose={() => setProposalOpen(false)} />
    </>
  );
};

/* ----------------------------------------------------------------- notes -- */

export const LeadNotesTab = ({ leadId, entries, onAdded }: { leadId: string; entries: DiaryEntry[]; onAdded: () => void }) => {
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<LogMode>("NOTE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = !note.replace(/^(Call|Visit):\s*/, "").trim();

  const add = async () => {
    if (empty) return;
    setSaving(true);
    setError(null);
    try {
      await addLeadNote(leadId, note);
      setNote(withLogMode("", mode));
      onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card style={styles.gapSm}>
        <Segmented
          options={[
            { key: "NOTE", label: "Note" },
            { key: "CALL", label: "Call" },
            { key: "VISIT", label: "Visit" },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setNote((draft) => withLogMode(draft, next));
          }}
        />
        <Field
          value={note}
          onChangeText={setNote}
          placeholder={mode === "CALL" ? "What was discussed on the call…" : mode === "VISIT" ? "How the site visit went…" : "A note about this lead…"}
          multiline
          maxLength={2000}
        />
        <InlineError message={error} />
        <Button label={mode === "CALL" ? "Log call" : mode === "VISIT" ? "Log visit" : "Add note"} icon="add" size="sm" disabled={empty} loading={saving} onPress={add} />
      </Card>
      {entries.length ? (
        entries.map((entry) => {
          const author = entry.createdBy || entry.author;
          return (
            <Card key={entry._id} style={styles.gapSm}>
              {logModeOf(entry.note || "") !== "NOTE" ? <Badge label={logModeOf(entry.note || "") === "CALL" ? "Call" : "Visit"} tone={logModeOf(entry.note || "") === "CALL" ? "primary" : "violet"} /> : null}
              <Text variant="body">{(entry.note || "").replace(/^(Call|Visit):\s*/, "")}</Text>
              <View style={styles.authorRow}>
                <Avatar name={author?.name || "?"} size={22} />
                <Text variant="tiny" color="faint">
                  {[author?.name, formatWhen(entry.createdAt)].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </Card>
          );
        })
      ) : (
        <Text variant="small" color="muted" align="center">
          No notes yet.
        </Text>
      )}
    </>
  );
};

/* -------------------------------------------------------------- activity -- */

export const LeadActivityTab = ({ lead, activity, tasks }: { lead: LeadDetail; activity: LeadActivity[]; tasks: Task[] }) => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const history = [...(lead.assignmentHistory || [])].reverse();
  const [filter, setFilter] = useState<TimelineFilter>("ALL");
  const shown = activity.filter((entry) => matchesTimeline(entry.action || "", filter));
  return (
    <>
      <SectionTitle title={`Tasks${tasks.length ? ` · ${tasks.length}` : ""}`} action="New task" onAction={() => navigation.navigate("NewTask", { leadId: lead._id, leadName: lead.name })} />
      {tasks.length ? (
        sortTasks(tasks).map((task) => <TaskRow key={task._id} task={task} showAssignee onPress={() => navigation.navigate("TaskDetail", { taskId: task._id })} />)
      ) : (
        <Text variant="small" color="muted">
          No tasks for this lead.
        </Text>
      )}
      {history.length ? (
        <>
          <SectionTitle title="Assignment history" />
          <Card style={styles.rows}>
            {history.map((entry, index) => (
              <View key={entry._id} style={[styles.historyRow, index < history.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Icon name="swap-horizontal" size={18} color={colors.textMuted} />
                <View style={styles.flex}>
                  <Text variant="small">
                    {entry.fromUser?.name ? `${entry.fromUser.name} → ` : "Assigned to "}
                    {entry.toUser?.name || "—"}
                  </Text>
                  <Text variant="tiny" color="faint">
                    {[entry.createdBy?.name ? `by ${entry.createdBy.name}` : "", formatWhen(entry.createdAt)].filter(Boolean).join(" · ")}
                  </Text>
                  {entry.reason ? (
                    <Text variant="tiny" color="muted">
                      “{entry.reason}”
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      <SectionTitle title="Activity timeline" />
      <View style={styles.chips}>
        {(
          [
            ["ALL", "All"],
            ["NOTES", "Notes"],
            ["CALLS", "Calls"],
            ["VISITS", "Visits"],
            ["ASSIGNMENTS", "Assignments"],
          ] as [TimelineFilter, string][]
        ).map(([key, label]) => (
          <Chip key={key} label={label} selected={filter === key} onPress={() => setFilter(key)} />
        ))}
      </View>
      <Card style={styles.rows}>
        {shown.length ? (
          shown.map((entry, index) => (
            <View key={entry._id} style={styles.activity}>
              <View style={styles.timeline}>
                <View style={[styles.timelineDot, { backgroundColor: index === 0 ? colors.primary : colors.border }]} />
                {index < shown.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
              </View>
              <View style={[styles.flex, styles.activityBody]}>
                <Text variant="small">{entry.action}</Text>
                <Text variant="tiny" color="faint">
                  {[entry.performedBy?.name, formatWhen(entry.createdAt)].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text variant="small" color="muted">
            {filter === "ALL" ? "No activity recorded yet." : "Nothing of this kind yet."}
          </Text>
        )}
      </Card>
    </>
  );
};

/* ---------------------------------------------------------------- shared -- */

const InfoRow = ({ icon, label, value, last }: { icon: IconName; label: string; value?: string; last?: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text variant="small" color="muted" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="small" color={value ? "text" : "faint"} style={styles.infoValue} numberOfLines={2}>
        {value || "—"}
      </Text>
    </View>
  );
};

const PersonRow = ({ label, person, last }: { label: string; person?: PersonRef; last?: boolean }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Avatar name={person?.name || "?"} size={30} />
      <View style={styles.flex}>
        <Text variant="tiny" color="faint">
          {label}
        </Text>
        <Text variant="small" color={person?.name ? "text" : "faint"}>
          {person?.name || "Unassigned"}
          {person?.role ? <Text variant="tiny" color="faint">{`  ${roleLabel(person.role)}`}</Text> : null}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stepper: { flexDirection: "row" },
  step: { flex: 1, gap: 6 },
  stepTrack: { flexDirection: "row", alignItems: "center" },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepLine: { flex: 1, height: 2 },
  inlineCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  squareIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  missing: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  rows: { paddingVertical: space.xs },
  infoRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  infoLabel: { width: 76 },
  infoValue: { flex: 1, textAlign: "right" },
  propertyRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  historyRow: { flexDirection: "row", gap: space.md, paddingVertical: space.md },
  activity: { flexDirection: "row", gap: space.md },
  activityBody: { paddingVertical: space.sm, gap: 2 },
  timeline: { width: 12, alignItems: "center", paddingTop: 13 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { width: 2, flex: 1, marginTop: 2 },
});
