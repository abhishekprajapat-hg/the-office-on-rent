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
  // Blank rows are kept and each row is tagged with its spreadsheet row number
  // (__rowNum__, 0-based), so upload reports can point at the exact row.
  return workbook.SheetNames.map((sheet) => {
    const worksheet = workbook.Sheets[sheet]!;
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", blankrows: true, raw: false }) as unknown[][];
    const firstRow = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]).s.r : 0;
    matrix.forEach((cells, index) => {
      if (Array.isArray(cells) && !Number.isInteger((cells as { __rowNum__?: number }).__rowNum__)) {
        Object.defineProperty(cells, "__rowNum__", { value: firstRow + index, enumerable: false });
      }
    });
    return { name: /\.csv$/i.test(name) ? "CSV" : sheet, matrix };
  });
};
