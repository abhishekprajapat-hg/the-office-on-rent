import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { api, errorMessage } from "../../api/client";
import { listUsers, type TeamUser } from "../../api/users";
import { useUser } from "../../auth/AuthProvider";
import { BULK_LEAD_SHEET_TYPES, parseMatrices } from "../../lib/bulkLeads";
import { formatDate } from "../../lib/format";
import { pickSpreadsheet, readSheets } from "../../lib/spreadsheet";
import { statusMeta } from "../../lib/leadStatus";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Badge, Body, Button, Card, InlineError, Select, Text } from "../../ui";

type ParsedRow = { name: string; phone: string; city?: string; status: string; nextFollowUp?: string; sourceRow?: number | null; sheetName?: string };
/* A row (or a whole sheet, when sourceRow is null) the file reader could not use. */
type SkippedRow = { sheetName?: string; sourceRow?: number | null; name?: string; phone?: string; reason: string };
type RowResult = {
  row: number;
  sourceRow?: number | null;
  sheetName?: string;
  name?: string;
  phone?: string;
  status: "CREATED" | "UPDATED" | "FAILED";
  leadStatus?: string;
  assignedTo?: string;
  message?: string;
};
type AssignmentSummary = {
  mode?: "SELF" | "AUTO" | "USER";
  assignedCount?: number;
  pendingCount?: number;
  byUser?: { userId: string; name: string; count: number }[];
  unassigned?: { reason: string; message: string; count: number }[];
};
type UploadResult = {
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  failures?: { row?: number | string; sourceRow?: number | null; sheetName?: string; name?: string; phone?: string; message?: string; reason?: string }[];
  results?: RowResult[];
  assignment?: AssignmentSummary;
};

const MAX_LISTED = 200;
/* "Leads · row 14", "Row 14" (CSV) or the sheet name for a whole-sheet note. */
const rowLabel = (row: { sourceRow?: number | null; sheetName?: string; row?: number | string }) => {
  if (row.sourceRow) return row.sheetName && row.sheetName !== "CSV" ? `${row.sheetName} · row ${row.sourceRow}` : `Row ${row.sourceRow}`;
  if (row.sheetName) return `Sheet "${row.sheetName}"`;
  return row.row ? `Upload row ${row.row}` : "";
};

const CATEGORY_LABELS: Record<string, string> = { COMMERCIAL: "Commercial", RESIDENTIAL: "Residential", COWORKING: "Coworking" };
// Same roles a lead can be manually transferred to.
const ASSIGNEE_ROLES = ["ADMIN", "MANAGER", "INSIDE_EXECUTIVE", "EXECUTIVE", "FIELD_EXECUTIVE"];

export const BulkUploadScreen = ({ navigation }: RootScreenProps<"BulkUpload">) => {
  const { colors } = useTheme();
  const user = useUser();
  const role = String(user.role || "").toUpperCase();
  const userCategory = String(user.roleType || "COMMERCIAL").toUpperCase();
  // As on the web: an Admin or an all-categories user picks any sheet type;
  // anyone else uploads only their own category (the server refuses the rest).
  const sheetTypes = useMemo(() => {
    const all = Object.values(BULK_LEAD_SHEET_TYPES) as string[];
    if (role === "ADMIN" || userCategory === "BOTH") return all;
    return all.includes(userCategory) ? [userCategory] : [BULK_LEAD_SHEET_TYPES.COMMERCIAL as string];
  }, [role, userCategory]);
  // Admin / Manager choose how new leads are assigned; anyone else's uploads
  // are assigned to themselves.
  const canChooseAssignment = role === "ADMIN" || role === "MANAGER";
  const [assignMode, setAssignMode] = useState<"AUTO" | "USER">("AUTO");
  const [assignUserId, setAssignUserId] = useState("");
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [sheetType, setSheetType] = useState<string>(sheetTypes[0]);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [source, setSource] = useState<{ uri: string; name: string } | null>(null);

  useEffect(() => {
    if (!canChooseAssignment) return undefined;
    let alive = true;
    listUsers({ crmAssignable: "true", fields: "_id,name,role,roleType,isActive" })
      .then((rows) => { if (alive) setTeamUsers(rows.filter((row) => row.isActive !== false)); })
      .catch(() => { if (alive) setTeamUsers([]); });
    return () => { alive = false; };
  }, [canChooseAssignment]);

  const assigneeOptions = useMemo(
    () => teamUsers
      .filter((row) => ASSIGNEE_ROLES.includes(String(row.role || "").toUpperCase()))
      .filter((row) => {
        const rowCategory = String(row.roleType || "COMMERCIAL").toUpperCase();
        return String(row.role).toUpperCase() === "ADMIN" || rowCategory === "BOTH" || rowCategory === sheetType;
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [teamUsers, sheetType],
  );

  // A person picked for one category is cleared when the sheet type changes to one they do not work.
  useEffect(() => {
    if (assignUserId && !assigneeOptions.some((row) => row._id === assignUserId)) setAssignUserId("");
  }, [assigneeOptions, assignUserId]);

  const categoryWord = (CATEGORY_LABELS[sheetType] || "").toLowerCase();

  const parse = async (file: { uri: string; name: string }, type: string) => {
    setParsing(true);
    setError(null);
    setResult(null);
    const skippedRows: SkippedRow[] = [];
    try {
      const parsed = parseMatrices(await readSheets(file.uri, file.name), type, skippedRows) as ParsedRow[];
      if (!parsed.length) {
        throw new Error(skippedRows.length
          ? `No lead rows could be read: ${skippedRows.length} row${skippedRows.length === 1 ? " or sheet was" : "s or sheets were"} skipped (listed below).`
          : "No leads found. The sheet needs a header row with NAME and CONTACT / PHONE columns.");
      }
      setRows(parsed);
    } catch (err) {
      setRows(null);
      setError(errorMessage(err, "Couldn't read that file."));
    } finally {
      setSkipped(skippedRows);
      setParsing(false);
    }
  };

  const pick = async () => {
    let file;
    try {
      file = await pickSpreadsheet();
    } catch (err) {
      return setError(errorMessage(err));
    }
    if (!file) return;
    setFileName(file.name);
    setSource(file);
    await parse(file, sheetType);
  };

  const upload = async () => {
    if (!rows?.length) return;
    setUploading(true);
    setError(null);
    try {
      const assignment = canChooseAssignment
        ? (assignMode === "USER" ? { mode: "USER", userId: assignUserId } : { mode: "AUTO" })
        : undefined;
      const res = await api.post<UploadResult>("/leads/bulk", { rows, ...(assignment ? { assignment } : {}) }, { timeout: 120000 });
      setResult(res.data);
      setRows(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const statusCounts = (rows || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <Body>
      <Card style={styles.gap}>
        <Text variant="heading">Sheet type</Text>
        <Text variant="small" color="muted">
          Decides how requirement columns are read, as on the web.
        </Text>
        <Select
          title="Sheet type"
          options={sheetTypes.map((type) => ({ key: type, label: CATEGORY_LABELS[type] || type }))}
          value={sheetType}
          onChange={(type) => {
            setSheetType(type);
            if (source) parse(source, type);
          }}
        />
        <Button label={fileName ? "Choose another file" : "Choose CSV or Excel file"} icon="document-attach-outline" variant="secondary" loading={parsing} onPress={pick} />
        {fileName ? (
          <Text variant="small" color="muted">
            {fileName}
          </Text>
        ) : null}
        <Text variant="tiny" color="faint">
          Columns are matched by name: name, phone/mobile, email, city/location, project, requirement, budget, status, follow up, source and more.
        </Text>
      </Card>

      <Card style={styles.gap}>
        <Text variant="heading">Assign new leads</Text>
        {canChooseAssignment ? (
          <>
            <Select
              title="Assign new leads"
              options={[
                { key: "AUTO", label: "Auto-assign", hint: `Spread across active ${categoryWord} executives by workload` },
                { key: "USER", label: "Assign to one person", hint: "Every new lead goes to the person you pick" },
              ]}
              value={assignMode}
              onChange={(key) => setAssignMode(key as "AUTO" | "USER")}
            />
            {assignMode === "USER" ? (
              <Select
                title="Assign to"
                placeholder={assigneeOptions.length ? "Choose a person" : `No active person works ${categoryWord} leads`}
                options={assigneeOptions.map((row) => ({ key: row._id, label: row.name, hint: row.role.replace(/_/g, " ").toLowerCase() }))}
                value={assignUserId}
                onChange={(key) => setAssignUserId(key)}
              />
            ) : null}
            <Text variant="tiny" color="faint">
              Only people who work {categoryWord} leads are listed. Rows for a lead that already exists keep its current owner.
            </Text>
          </>
        ) : (
          <Text variant="small" color="muted">
            New leads from this sheet will be assigned to you.
          </Text>
        )}
      </Card>

      <InlineError message={error} />

      {skipped.length && !result ? (
        <Card style={styles.gap}>
          <Text variant="heading">
            {skipped.filter((row) => row.sourceRow).length} row{skipped.filter((row) => row.sourceRow).length === 1 ? "" : "s"} will be skipped
          </Text>
          {skipped.slice(0, MAX_LISTED).map((row, index) => (
            <Text key={index} variant="small" color={colors.warning}>
              {[rowLabel(row), row.name, row.reason].filter(Boolean).join(" · ")}
            </Text>
          ))}
          {skipped.length > MAX_LISTED ? <Text variant="tiny" color="faint">…and {skipped.length - MAX_LISTED} more</Text> : null}
        </Card>
      ) : null}

      {rows ? (
        <Card style={styles.gap}>
          <Text variant="heading">{rows.length} leads ready</Text>
          <View style={styles.chips}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge key={status} label={`${statusMeta(status).label} · ${count}`} tone={statusMeta(status).tone} />
            ))}
          </View>
          {rows.slice(0, 8).map((row, index) => (
            <View key={`${row.phone}-${index}`} style={[styles.preview, { borderBottomColor: colors.border }]}>
              <Text variant="smallStrong" style={styles.flex} numberOfLines={1}>
                {row.name}
              </Text>
              <Text variant="small" color="muted">
                {row.phone}
              </Text>
              {row.nextFollowUp ? (
                <Text variant="tiny" color="faint">
                  {formatDate(row.nextFollowUp)}
                </Text>
              ) : null}
            </View>
          ))}
          {rows.length > 8 ? (
            <Text variant="tiny" color="faint">
              …and {rows.length - 8} more
            </Text>
          ) : null}
          <Text variant="small" color="muted">
            Existing phone numbers are updated rather than duplicated.
          </Text>
          <Button
            label={`Upload ${rows.length} leads`}
            icon="cloud-upload-outline"
            loading={uploading}
            disabled={canChooseAssignment && assignMode === "USER" && !assignUserId}
            onPress={upload}
          />
        </Card>
      ) : null}

      {result ? (
        <Card style={styles.gap}>
          <Text variant="heading">Upload finished</Text>
          <View style={styles.chips}>
            <Badge label={`${result.createdCount} added`} tone="success" />
            <Badge label={`${result.updatedCount} updated`} tone="info" />
            <Badge label={`${result.failedCount} failed`} tone={result.failedCount ? "danger" : "neutral"} />
          </View>
          {result.createdCount > 0 && result.assignment?.mode === "SELF" ? (
            <Text variant="small" color="muted">All {result.createdCount} new leads are assigned to you.</Text>
          ) : null}
          {result.createdCount > 0 && result.assignment?.mode !== "SELF" && result.assignment?.byUser?.length ? (
            <Text variant="small" color="muted">
              Assigned: {result.assignment.byUser.map((row) => `${row.name} ${row.count}`).join(", ")}
            </Text>
          ) : null}
          {(result.assignment?.unassigned || []).map((row) => (
            <Text key={row.reason} variant="small" color="danger">
              {row.count} left unassigned: {row.message}.
            </Text>
          ))}
          {result.assignment?.pendingCount ? (
            <Text variant="small" color="muted">{result.assignment.pendingCount} more are still being assigned.</Text>
          ) : null}
          {result.updatedCount > 0 ? (
            <Text variant="tiny" color="faint">Updated leads keep their current owner.</Text>
          ) : null}
          {(result.failures || []).length ? (
            <Text variant="smallStrong">Failed rows ({(result.failures || []).length})</Text>
          ) : null}
          {(result.failures || []).slice(0, MAX_LISTED).map((failure, index) => (
            <Text key={index} variant="small" color="danger">
              {[rowLabel(failure), failure.name, failure.phone, failure.message || failure.reason].filter(Boolean).join(" · ")}
            </Text>
          ))}
          {(result.failures || []).length > MAX_LISTED ? (
            <Text variant="tiny" color="faint">…and {(result.failures || []).length - MAX_LISTED} more</Text>
          ) : null}
          {skipped.length ? (
            <Text variant="smallStrong">Skipped while reading the file ({skipped.length})</Text>
          ) : null}
          {skipped.slice(0, MAX_LISTED).map((row, index) => (
            <Text key={`s-${index}`} variant="small" color={colors.warning}>
              {[rowLabel(row), row.name, row.reason].filter(Boolean).join(" · ")}
            </Text>
          ))}
          {(result.results || []).filter((row) => row.status === "UPDATED").length ? (
            <Text variant="smallStrong">Existing leads updated ({(result.results || []).filter((row) => row.status === "UPDATED").length})</Text>
          ) : null}
          {(result.results || []).filter((row) => row.status === "UPDATED").slice(0, MAX_LISTED).map((row) => (
            <Text key={`u-${row.row}`} variant="small" color="muted">
              {[rowLabel(row), row.name, row.assignedTo ? `owner ${row.assignedTo}` : "", row.message].filter(Boolean).join(" · ")}
            </Text>
          ))}
          <Button label="Done" onPress={() => navigation.goBack()} />
        </Card>
      ) : null}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  preview: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
