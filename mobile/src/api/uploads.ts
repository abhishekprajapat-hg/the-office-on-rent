import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { api } from "./client";
import { mimeFor, uploadProblem } from "../lib/uploadRules";

export type UploadCategory =
  | "inventory-images"
  | "inventory-floorplans"
  | "inventory-documents"
  | "chat"
  | "lead-documents"
  | "profile-images"
  | "coworking-documents"
  | "task-attachments";

export type LocalFile = { uri: string; name: string; mimeType: string; size?: number | null };

export type UploadedFile = { url: string; fileName: string; mimeType: string; size: number };

export class PickError extends Error {}

/* A photo from the camera or the library. Returns null when the person cancels. */
export const pickImage = async (source: "camera" | "library"): Promise<LocalFile | null> => {
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PickError(source === "camera" ? "Camera access is off. Allow it in your phone's settings." : "Photo access is off. Allow it in your phone's settings.");
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8, exif: false };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const name = asset.fileName || `photo-${Date.now()}.jpg`;
  return { uri: asset.uri, name, mimeType: mimeFor(name, asset.mimeType), size: asset.fileSize };
};

/* Any supported document (PDF, Word, Excel, image). */
export const pickDocument = async (): Promise<LocalFile | null> => {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mimeType: mimeFor(asset.name, asset.mimeType), size: asset.size };
};

/*
 * Multipart upload. React Native's FormData takes a { uri, name, type }
 * descriptor; a browser needs the actual bytes, so the web preview reads the
 * blob first.
 */
export const uploadFile = async (file: LocalFile, category: UploadCategory): Promise<UploadedFile> => {
  const problem = uploadProblem(file);
  if (problem) throw new PickError(problem);
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", new File([blob], file.name, { type: file.mimeType }));
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  const res = await api.post<UploadedFile>("/uploads", form, {
    params: { category },
    // A browser must set the multipart boundary itself, so the header is native-only.
    headers: Platform.OS === "web" ? {} : { "Content-Type": "multipart/form-data" },
    timeout: 120000,
    transformRequest: (data) => data,
  });
  return res.data;
};
