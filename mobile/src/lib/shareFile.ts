import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";
import { cacheDirectory, EncodingType, writeAsStringAsync } from "expo-file-system/legacy";

/*
 * Hands a generated file (a CSV export) to the phone's share sheet, so it can
 * be saved to Files or sent to Drive, mail or WhatsApp. The browser downloads it.
 */
export const shareTextFile = async (fileName: string, text: string, mimeType = "text/csv") => {
  if (Platform.OS === "web") {
    // A BOM so Excel reads ₹ and names in other scripts correctly.
    const blob = new Blob(["﻿", text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()) || !cacheDirectory) {
    await Share.share({ title: fileName, message: text });
    return;
  }
  const uri = `${cacheDirectory}${fileName}`;
  await writeAsStringAsync(uri, `﻿${text}`, { encoding: EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName, UTI: mimeType === "text/csv" ? "public.comma-separated-values-text" : undefined });
};
