import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { api, errorMessage } from "../../api/client";
import { BULK_LEAD_SHEET_TYPES, parseMatrices } from "../../lib/bulkLeads";
import { formatDate } from "../../lib/format";
import { statusMeta } from "../../lib/leadStatus";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { space } from "../../theme/tokens";
import { Badge, Body, Button, Card, Chip, InlineError, Text } from "../../ui";

type ParsedRow = { name: string; phone: string; city?: string; status: string; nextFollowUp?: string };
type UploadResult = { createdCount: number; updatedCount: number; failedCount: number; failures?: { row?: number; phone?: string; message?: string; reason?: string }[] };

/* Reads the picked file into sheet matrices: base64 on a phone, bytes in a browser. */
const readSheets = async (uri: string, name: string) => {
  const workbook =
    Platform.OS === "web"
      ? XLSX.read(await (await fetch(uri)).arrayBuffer(), { type: "array", cellDates: true, raw: false })
      : XLSX.read(await readAsStringAsync(uri, { encoding: EncodingType.Base64 }), { type: "base64", cellDates: true, raw: false });
  // A CSV comes back as one sheet named "Sheet1"; name it CSV as the web does.
  return workbook.SheetNames.map((sheet) => ({
    name: /\.csv$/i.test(name) ? "CSV" : sheet,
    matrix: XLSX.utils.sheet_to_json(workbook.Sheets[sheet]!, { header: 1, defval: "", blankrows: false, raw: false }) as unknown[][],
  }));
};

export const BulkUploadScreen = ({ navigation }: RootScreenProps<"BulkUpload">) => {
  const { colors } = useTheme();
  const [sheetType, setSheetType] = useState<string>(BULK_LEAD_SHEET_TYPES.COMMERCIAL);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [source, setSource] = useState<{ uri: string; name: string } | null>(null);

  const parse = async (file: { uri: string; name: string }, type: string) => {
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const parsed = parseMatrices(await readSheets(file.uri, file.name), type) as ParsedRow[];
      if (!parsed.length) throw new Error("No leads found. The sheet needs a header row with at least a name or phone column.");
      setRows(parsed);
    } catch (err) {
      setRows(null);
      setError(errorMessage(err, "Couldn't read that file."));
    } finally {
      setParsing(false);
    }
  };

  const pick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = { uri: picked.assets[0].uri, name: picked.assets[0].name };
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return setError("Choose a .csv, .xlsx or .xls file.");
    setFileName(file.name);
    setSource(file);
    await parse(file, sheetType);
  };

  const upload = async () => {
    if (!rows?.length) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.post<UploadResult>("/leads/bulk", { rows }, { timeout: 120000 });
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
        <View style={styles.chips}>
          {Object.values(BULK_LEAD_SHEET_TYPES).map((type) => (
            <Chip
              key={type as string}
              label={(type as string).charAt(0) + (type as string).slice(1).toLowerCase()}
              selected={sheetType === type}
              onPress={() => {
                setSheetType(type as string);
                if (source) parse(source, type as string);
              }}
            />
          ))}
        </View>
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

      <InlineError message={error} />

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
          <Button label={`Upload ${rows.length} leads`} icon="cloud-upload-outline" loading={uploading} onPress={upload} />
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
          {(result.failures || []).slice(0, 10).map((failure, index) => (
            <Text key={index} variant="small" color="danger">
              {[failure.row ? `Row ${failure.row}` : "", failure.phone, failure.message || failure.reason].filter(Boolean).join(" · ")}
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
