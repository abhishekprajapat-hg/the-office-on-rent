import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import * as XLSX from "xlsx";

export type PickedSheet = { uri: string; name: string };

/* Picks a .csv, .xlsx or .xls file; null when cancelled. */
export const pickSpreadsheet = async (): Promise<PickedSheet | null> => {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const file = { uri: picked.assets[0].uri, name: picked.assets[0].name };
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Choose a .csv, .xlsx or .xls file.");
  return file;
};

/* Reads the picked file into sheet matrices: base64 on a phone, bytes in a browser. */
export const readSheets = async (uri: string, name: string) => {
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
