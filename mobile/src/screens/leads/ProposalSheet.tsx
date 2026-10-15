import React, { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { cacheDirectory, copyAsync, deleteAsync } from "expo-file-system/legacy";
import { errorMessage, mediaUrl, webOrigin } from "../../api/client";
import { createShareLink, type Property } from "../../api/inventory";
import type { LeadDetail } from "../../api/leads";
import { whatsappNumber } from "../../lib/format";
import { clientLabel, proposalFileName, proposalHtml, proposalMailUrl, proposalSubject, proposalText, type ProposalItem } from "../../lib/proposal";
import { useTheme } from "../../theme/ThemeProvider";
import { Button, Field, InlineError, Sheet, Text, Toggle } from "../../ui";

const PHOTOS_PER_PROPERTY = 2;

/*
 * Send a proposal (web lead → Proposal): validity, a special note and photos,
 * then a PDF to share, or the same summary as a WhatsApp or email message.
 */
export const ProposalSheet = ({ visible, lead, properties, onClose }: { visible: boolean; lead: LeadDetail; properties: Property[]; onClose: () => void }) => {
  const { colors } = useTheme();
  const [validity, setValidity] = useState("7");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState(true);
  const [busy, setBusy] = useState<"pdf" | "whatsapp" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setError(null);
      setDone(null);
    }
  }, [visible]);

  /* Public share links, made once per property. */
  const items = async (): Promise<ProposalItem[]> => {
    const missing = properties.filter((property) => !links[property._id]);
    const made = await Promise.all(
      missing.map((property) =>
        createShareLink(property._id)
          .then((res) => [property._id, `${webOrigin()}/shared/inventory/${res.shareToken}`] as const)
          .catch(() => [property._id, ""] as const),
      ),
    );
    const all = { ...links, ...Object.fromEntries(made) };
    setLinks(all);
    return properties.map((property) => ({
      property,
      link: all[property._id] || undefined,
      images: photos ? (property.images || []).slice(0, PHOTOS_PER_PROPERTY).map((url) => mediaUrl(url) || url) : [],
    }));
  };
  const input = (list: ProposalItem[]) => ({ clientName: lead.name, projectInterested: lead.projectInterested, city: lead.city, items: list, validityDays: validity, note });

  const run = async (kind: "pdf" | "whatsapp" | "email", action: () => Promise<string | null>) => {
    setBusy(kind);
    setError(null);
    setDone(null);
    try {
      setDone(await action());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const sharePdf = () =>
    run("pdf", async () => {
      const html = proposalHtml(input(await items()));
      if (Platform.OS === "web") {
        // The browser's own print dialog saves it as a PDF.
        await Print.printAsync({ html });
        return null;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) return "Sharing isn't available on this phone.";
      // A readable name for whoever receives it, instead of the print engine's random one.
      const named = `${cacheDirectory}${proposalFileName(lead.name)}`;
      await deleteAsync(named, { idempotent: true }).catch(() => {});
      const file = await copyAsync({ from: uri, to: named }).then(
        () => named,
        () => uri,
      );
      await Sharing.shareAsync(file, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: proposalSubject(properties.map((property) => ({ property }))) });
      return null;
    });

  const sendWhatsApp = () =>
    run("whatsapp", async () => {
      const text = proposalText(input(await items()));
      await Linking.openURL(`https://wa.me/${whatsappNumber(lead.phone)}?text=${encodeURIComponent(text)}`);
      return null;
    });

  const sendEmail = () =>
    run("email", async () => {
      const list = await items();
      const url = proposalMailUrl(lead.email, proposalSubject(list), proposalText(input(list)));
      if (!(await Linking.canOpenURL(url).catch(() => true))) return "No email app is set up on this phone.";
      await Linking.openURL(url);
      return null;
    });

  return (
    <Sheet
      visible={visible}
      title="Send proposal"
      subtitle={`${properties.length} ${properties.length === 1 ? "property" : "properties"} for ${lead.name}`}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button label="Share PDF" icon="document-text-outline" loading={busy === "pdf"} disabled={Boolean(busy)} onPress={sharePdf} />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" loading={busy === "whatsapp"} disabled={Boolean(busy) || !lead.phone} onPress={sendWhatsApp} />
            </View>
            <View style={styles.flex}>
              <Button label="Email" icon="mail-outline" variant="secondary" loading={busy === "email"} disabled={Boolean(busy)} onPress={sendEmail} />
            </View>
          </View>
        </View>
      }
    >
      <View style={[styles.list, { borderColor: colors.border }]}>
        {properties.map((property, index) => (
          <Text key={property._id} variant="small" numberOfLines={1}>
            {index + 1}. {clientLabel(property)}
          </Text>
        ))}
        <Text variant="tiny" color="muted">
          The client sees each property's ID and listing name, never the building or unit.
        </Text>
      </View>
      <Field label="Valid for (days)" value={validity} onChangeText={(value) => setValidity(value.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" placeholder="7" />
      <Field label="Special note" value={note} onChangeText={setNote} placeholder="Optional, e.g. rent negotiable for a 3-year lock-in" multiline maxLength={500} />
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">Include photos</Text>
          <Text variant="tiny" color="muted">
            Up to {PHOTOS_PER_PROPERTY} per property, in the PDF.
          </Text>
        </View>
        <Toggle value={photos} label="Include photos" onChange={setPhotos} />
      </View>
      {!lead.email ? (
        <Text variant="tiny" color="muted">
          This lead has no email; Email opens a blank message you can address.
        </Text>
      ) : null}
      <InlineError message={error} />
      {done ? (
        <Text variant="small" color="muted">
          {done}
        </Text>
      ) : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  footer: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  list: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12 },
});
