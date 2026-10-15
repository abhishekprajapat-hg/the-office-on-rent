import React, { useEffect, useLayoutEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { errorMessage, mediaUrl } from "../../api/client";
import { pickDocument, pickImage, uploadFile, type LocalFile } from "../../api/uploads";
import { DateTimeField } from "../../components/DateTimeField";
import { DocumentChecklist } from "../../components/coworking/DocumentChecklist";
import { isoDay } from "../../lib/attendanceState";
import { addMonths, type BoardDocument, type Cabin, type SecurityCheque } from "../../lib/coworkingBoard";
import { CLIENT_KINDS, ENTITY_TYPES, INDUSTRIES, kycStatusOf, resolveIndustry, splitIndustry } from "../../lib/coworkingKyc";
import { formatDate, rupees } from "../../lib/format";
import { useBoard } from "../../lib/useBoard";
import type { RootScreenProps } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import { ActionSheet, Body, Button, Card, ErrorState, Field, FooterBar, InlineError, Loading, Segmented, Select, Text } from "../../ui";

const STEPS = ["Client", "Documents", "Agreement", "Review"];
const TERM_OPTIONS = [3, 6, 12, 24];
const DEPOSIT_MONTHS = [1, 2, 3, 6];
const LOCK_INS = [0, 3, 6, 12];
const DAY = 24 * 60 * 60 * 1000;

type ClientForm = {
  kind: string;
  entityType: string;
  companyName: string;
  contactPerson: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  industryChoice: string;
  industryCustom: string;
  signingAuthority2: string;
  secondPersonName: string;
  gstin: string;
  pan: string;
  documents: BoardDocument[];
};

type TermsForm = {
  startDate: Date;
  termMonths: number;
  lockInMonths: number;
  rentOverride: string;
  depositMonths: number;
  depositMode: "months" | "custom";
  depositAmount: string;
  noticePeriodDays: string;
  tokenAmount: string;
  cheque: { number: string; bank: string; amount: string; date: string; notes: string; file: SecurityCheque["file"] };
  notes: string;
};

const emptyClient = (): ClientForm => ({
  kind: "company",
  entityType: ENTITY_TYPES[0],
  companyName: "",
  contactPerson: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  ...splitIndustry(""),
  signingAuthority2: "",
  secondPersonName: "",
  gstin: "",
  pan: "",
  documents: [],
});

const emptyTerms = (): TermsForm => ({
  startDate: new Date(),
  termMonths: 12,
  lockInMonths: 6,
  rentOverride: "",
  depositMonths: 2,
  depositMode: "months",
  depositAmount: "",
  noticePeriodDays: "30",
  tokenAmount: "0",
  cheque: { number: "", bank: "", amount: "0", date: "", notes: "", file: null },
  notes: "",
});

const num = (value: string) => (value.trim() === "" ? NaN : Number(value));
const nonNegative = (value: string) => Number.isFinite(num(value)) && num(value) >= 0;

/*
 * Web: OnboardClientDialog. Who is taking the cabins, their documents, the
 * agreement, then a review before anything is committed. With a clientId it
 * edits an onboarded client and their agreement instead.
 */
export const OnboardScreen = ({ route, navigation }: RootScreenProps<"Onboard">) => {
  const { codes = [], clientId } = route.params || {};
  const editMode = Boolean(clientId);
  const { colors } = useTheme();
  const { board, loading, error, refresh, busy, actionError, run } = useBoard();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ClientForm>(emptyClient);
  const [terms, setTerms] = useState<TermsForm>(emptyTerms);
  const [ready, setReady] = useState(!editMode);
  const [chequePick, setChequePick] = useState(false);
  const [chequeBusy, setChequeBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const cabins: Cabin[] = (board?.cabins || []).filter((cabin) => (editMode ? cabin.client?.id === clientId : codes.includes(cabin.code)));

  /* Edit mode starts from the client and agreement as they stand (web BookingBoard initialTerms). */
  useEffect(() => {
    if (!editMode || ready || !cabins.length) return;
    const client = cabins[0]!.client!;
    const contract = cabins[0]!.contract!;
    setForm({
      kind: client.kind || "company",
      entityType: client.entityType || ENTITY_TYPES[0],
      companyName: client.name || "",
      contactPerson: client.contactPerson || "",
      dateOfBirth: String(client.dateOfBirth || "").slice(0, 10),
      phone: client.phone || "",
      email: client.email || "",
      ...splitIndustry(client.industry),
      signingAuthority2: client.signingAuthority2 || "",
      secondPersonName: client.secondPersonName || "",
      gstin: client.gstin || "",
      pan: client.pan || "",
      documents: client.documents || [],
    });
    const custom = contract.depositMode === "custom";
    setTerms({
      startDate: new Date(contract.startDate),
      termMonths: Math.max(1, Math.round((new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime()) / (30 * DAY))),
      lockInMonths: contract.lockInMonths ?? 0,
      rentOverride: String(cabins.reduce((sum, cabin) => sum + (cabin.contract?.monthlyRent || 0), 0)),
      depositMonths: contract.depositMonths || (contract.monthlyRent ? Math.max(1, Math.round(contract.deposit / contract.monthlyRent)) : 2),
      depositMode: custom ? "custom" : "months",
      depositAmount: custom ? String(cabins.reduce((sum, cabin) => sum + (cabin.contract?.deposit || 0), 0)) : "",
      noticePeriodDays: String(contract.noticePeriodDays ?? 30),
      tokenAmount: String(cabins.reduce((sum, cabin) => sum + (cabin.contract?.tokenAmount || 0), 0)),
      cheque: {
        number: contract.securityCheque?.number || "",
        bank: contract.securityCheque?.bank || "",
        amount: String(contract.securityCheque?.amount ?? 0),
        date: contract.securityCheque?.date || "",
        notes: contract.securityCheque?.notes || "",
        file: contract.securityCheque?.file || null,
      },
      notes: contract.notes || "",
    });
    setReady(true);
  }, [editMode, ready, cabins]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editMode ? "Edit onboarded client" : "Onboard client" });
  }, [navigation, editMode]);

  if (loading || !ready) return error ? <ErrorState message={error} onRetry={refresh} /> : <Loading />;
  if (error || !board) return <ErrorState message={error || "Couldn't load the board."} onRetry={refresh} />;
  if (!cabins.length) return <ErrorState message={editMode ? "This client no longer holds a cabin." : "Pick vacant cabins on the board first."} onRetry={() => navigation.goBack()} />;

  const set = (key: keyof ClientForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setTerm = (key: keyof TermsForm) => (value: string) => setTerms((prev) => ({ ...prev, [key]: value }));
  const setCheque = (key: keyof TermsForm["cheque"]) => (value: string) => setTerms((prev) => ({ ...prev, cheque: { ...prev.cheque, [key]: value } }));

  const isCompany = form.kind === "company";
  const listRent = cabins.reduce((total, cabin) => total + cabin.monthlyRent, 0);
  const rent = terms.rentOverride.trim() === "" ? listRent : Number(terms.rentOverride) || 0;
  const custom = terms.depositMode === "custom";
  const customDeposit = num(terms.depositAmount);
  const deposit = custom ? (Number.isFinite(customDeposit) ? customDeposit : 0) : rent * terms.depositMonths;
  const capacity = cabins.reduce((total, cabin) => total + cabin.seats, 0);
  const clientName = form.companyName.trim();
  const kyc = kycStatusOf(form);
  const validDeposit = !custom || (Number.isFinite(customDeposit) && customDeposit >= 0);
  const validTerms = validDeposit && [terms.noticePeriodDays, terms.tokenAmount, terms.cheque.amount].every(nonNegative);
  const today = isoDay(new Date());
  const validBirth = !form.dateOfBirth || (form.dateOfBirth >= "1900-01-01" && form.dateOfBirth <= today);
  const validProfile = form.industryChoice !== "Other" || Boolean(form.industryCustom.trim());
  const blocker =
    step === 0
      ? !clientName
        ? `Enter the ${isCompany ? "company" : "client's"} name.`
        : !validProfile
          ? "Type the client's work profile."
          : null
      : !validBirth
        ? "Check the date of birth."
        : step >= 2 && !validTerms
          ? !validDeposit
            ? "Enter the deposit amount."
            : "Notice period, token and cheque amount must be 0 or more."
          : null;

  const attachCheque = async (pick: () => Promise<LocalFile | null>) => {
    setLocalError(null);
    try {
      const file = await pick();
      if (!file) return;
      setChequeBusy(true);
      const saved = await uploadFile(file, "coworking-documents");
      setTerms((prev) => ({ ...prev, cheque: { ...prev.cheque, file: { url: saved.url, fileName: saved.fileName || file.name, size: saved.size, type: saved.mimeType, uploadedAt: new Date().toISOString() } } }));
    } catch (err) {
      setLocalError(errorMessage(err));
    } finally {
      setChequeBusy(false);
    }
  };

  const confirm = async () => {
    const { industryChoice, industryCustom, ...rest } = form;
    const client = { ...rest, industry: resolveIndustry({ industryChoice, industryCustom }), name: clientName };
    const termsPayload = {
      startDate: terms.startDate.toISOString(),
      termMonths: terms.termMonths,
      lockInMonths: terms.lockInMonths,
      rent,
      depositMonths: terms.depositMonths,
      depositMode: terms.depositMode,
      depositAmount: custom ? customDeposit : null,
      noticePeriodDays: Number(terms.noticePeriodDays),
      tokenAmount: Number(terms.tokenAmount),
      securityCheque: { ...terms.cheque, amount: Number(terms.cheque.amount) || 0 },
      notes: terms.notes,
    };
    const ok = editMode
      ? await run({ type: "UPDATE_CLIENT", clientId: clientId!, client, terms: termsPayload })
      : await run({ type: "ONBOARD", cabinCodes: cabins.map((cabin) => cabin.code), client, terms: termsPayload });
    if (ok) navigation.goBack();
  };

  const summary = (
    <Card style={[styles.summary, { backgroundColor: colors.surfaceAlt }]}>
      <Text variant="tiny" color="muted" style={styles.caps}>
        CABINS SELECTED
      </Text>
      {cabins.map((cabin) => (
        <View key={cabin.code} style={styles.line}>
          <Text variant="smallStrong">{cabin.label}</Text>
          <Text variant="small" color="muted" style={styles.flex}>
            {cabin.seats} seater
          </Text>
          <Text variant="small">{rupees(cabin.monthlyRent)}</Text>
        </View>
      ))}
      <View style={[styles.line, styles.divider, { borderTopColor: colors.border }]}>
        <Text variant="small" color="muted" style={styles.flex}>
          Monthly rent
        </Text>
        <Text variant="smallStrong">{rupees(rent)}</Text>
      </View>
      <View style={styles.line}>
        <Text variant="small" color="muted" style={styles.flex}>
          Security deposit
        </Text>
        <Text variant="small">{rupees(deposit)}</Text>
      </View>
      <View style={styles.line}>
        <Text variant="small" color="muted" style={styles.flex}>
          Due on signing
        </Text>
        <Text variant="smallStrong">{rupees(rent + deposit)}</Text>
      </View>
      <Text variant="tiny" color="faint">
        {terms.termMonths} months · starts {formatDate(terms.startDate)}, ends {formatDate(addMonths(terms.startDate.toISOString(), terms.termMonths))}
      </Text>
    </Card>
  );

  return (
    <View style={styles.flex}>
      <Body footerSpace>
        <View style={styles.stepper}>
          <Text variant="smallStrong" color="primary">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </Text>
          <View style={styles.stepBars}>
            {STEPS.map((label, index) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}: ${label}`}
                accessibilityState={{ selected: index === step, disabled: index >= step }}
                disabled={index >= step}
                onPress={() => setStep(index)}
                hitSlop={8}
                style={[styles.stepBar, { backgroundColor: index <= step ? colors.primary : colors.border }]}
              />
            ))}
          </View>
        </View>
        <Text variant="small" color="muted">
          {cabins.length} {cabins.length === 1 ? "cabin" : "cabins"} · seats {capacity} · {cabins.map((cabin) => cabin.label).join(", ")}
        </Text>

        {step === 0 ? (
          <>
            <Text variant="smallStrong" color="muted">
              Client type — decides which documents are asked for
            </Text>
            <Segmented options={CLIENT_KINDS.map((option) => ({ key: option.id, label: option.label }))} value={form.kind} onChange={(kind) => setForm((prev) => ({ ...prev, kind }))} />
            {isCompany ? (
              <>
                <Field label="Company name" value={form.companyName} onChangeText={set("companyName")} placeholder="Nexbridge Analytics" />
                <Select label="Entity type" options={ENTITY_TYPES.map((type) => ({ key: type, label: type }))} value={form.entityType} onChange={set("entityType")} />
                <Field label="Signing authority 1" hint="The person who signs the agreement" value={form.contactPerson} onChangeText={set("contactPerson")} />
                <Field label="Signing authority 2 (optional)" value={form.signingAuthority2} onChangeText={set("signingAuthority2")} />
              </>
            ) : (
              <>
                <Field label="Full name" value={form.companyName} onChangeText={set("companyName")} placeholder="Rohit Ambekar" />
                <Field label="PAN" value={form.pan} onChangeText={(value) => set("pan")(value.toUpperCase())} autoCapitalize="characters" placeholder="ABCDE1234F" />
                <Field label="Person 2 name (optional)" value={form.secondPersonName} onChangeText={set("secondPersonName")} />
              </>
            )}
            <Field label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="+91 98200 00000" />
            <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
            <Select label={isCompany ? "Work profile / industry" : "Work profile"} placeholder="Choose" options={INDUSTRIES.map((industry) => ({ key: industry, label: industry }))} value={form.industryChoice} onChange={set("industryChoice")} />
            {form.industryChoice === "Other" ? <Field label="Specify work profile" value={form.industryCustom} onChangeText={set("industryCustom")} placeholder="e.g. Cybersecurity" maxLength={80} /> : null}
            {isCompany ? <Field label="GSTIN (optional)" hint="Needed before the first invoice" value={form.gstin} onChangeText={(value) => set("gstin")(value.toUpperCase())} autoCapitalize="characters" /> : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text variant="small" color="muted">
              {isCompany
                ? "A company signs through someone, so there are two identities to establish - the entity and the person authorised to bind it - plus the authorisation joining them."
                : "An individual signs for themselves, so their identity is the whole of it."}
            </Text>
            <DateTimeField
              label="Contact date of birth"
              mode="date"
              value={form.dateOfBirth ? new Date(`${form.dateOfBirth}T00:00:00`) : null}
              onChange={(value) => set("dateOfBirth")(value ? isoDay(value) : "")}
              clearable
            />
            <DocumentChecklist kind={form.kind} documents={form.documents} onChange={(documents) => setForm((prev) => ({ ...prev, documents }))} />
            <Text variant="tiny" color="faint">
              You can onboard before every document is in. Whatever is outstanding stays flagged on the client so it can be chased.
            </Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <DateTimeField label="Start date" mode="date" value={terms.startDate} onChange={(value) => value && setTerms((prev) => ({ ...prev, startDate: value }))} />
            <Text variant="smallStrong" color="muted">
              Term
            </Text>
            <Segmented options={TERM_OPTIONS.map((months) => ({ key: String(months), label: `${months}m` }))} value={String(terms.termMonths)} onChange={(value) => setTerms((prev) => ({ ...prev, termMonths: Number(value) }))} />
            <Field
              label="Monthly rent"
              value={terms.rentOverride}
              onChangeText={(value) => setTerm("rentOverride")(value.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
              placeholder={String(listRent)}
              suffix="₹"
              hint={listRent - rent > 0 ? `${rupees(listRent - rent)} below the ${rupees(listRent)} list rate` : `List rate ${rupees(listRent)} for these cabins`}
            />
            <Select
              label={`Deposit${custom ? "" : ` · ${rupees(deposit)}`}`}
              options={[...DEPOSIT_MONTHS.map((months) => ({ key: String(months), label: `${months} ${months === 1 ? "month" : "months"}` })), { key: "custom", label: "Custom amount" }]}
              value={custom ? "custom" : String(terms.depositMonths)}
              onChange={(key) =>
                key === "custom"
                  ? setTerms((prev) => ({ ...prev, depositMode: "custom", depositAmount: prev.depositAmount || String(deposit || "") }))
                  : setTerms((prev) => ({ ...prev, depositMode: "months", depositMonths: Number(key) }))
              }
            />
            {custom ? <Field label="Deposit amount" value={terms.depositAmount} onChangeText={(value) => setTerm("depositAmount")(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" suffix="₹" /> : null}
            <Select
              label="Lock-in"
              options={LOCK_INS.map((months) => ({ key: String(months), label: months ? `${months} months` : "No lock-in" }))}
              value={String(terms.lockInMonths)}
              onChange={(key) => setTerms((prev) => ({ ...prev, lockInMonths: Number(key) }))}
            />
            <View style={styles.pair}>
              <View style={styles.flex}>
                <Field label="Notice period" suffix="days" value={terms.noticePeriodDays} onChangeText={(value) => setTerm("noticePeriodDays")(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
              </View>
              <View style={styles.flex}>
                <Field label="Token paid" suffix="₹" value={terms.tokenAmount} onChangeText={(value) => setTerm("tokenAmount")(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" />
              </View>
            </View>
            <Card style={styles.gap}>
              <Text variant="bodyStrong">Security / deposit cheque</Text>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field label="Cheque number" value={terms.cheque.number} onChangeText={setCheque("number")} />
                </View>
                <View style={styles.flex}>
                  <Field label="Bank" value={terms.cheque.bank} onChangeText={setCheque("bank")} />
                </View>
              </View>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field label="Amount" suffix="₹" value={terms.cheque.amount} onChangeText={(value) => setCheque("amount")(value.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" />
                </View>
                <View style={styles.flex}>
                  <DateTimeField label="Cheque date" mode="date" value={terms.cheque.date ? new Date(`${terms.cheque.date}T00:00:00`) : null} onChange={(value) => setCheque("date")(value ? isoDay(value) : "")} clearable />
                </View>
              </View>
              <Field label="Notes" value={terms.cheque.notes} onChangeText={setCheque("notes")} />
              {terms.cheque.file?.url ? (
                <View style={styles.pair}>
                  <Button size="sm" variant="ghost" icon="document-outline" label={terms.cheque.file.fileName || "Cheque copy"} style={styles.flex} onPress={() => Linking.openURL(mediaUrl(terms.cheque.file!.url) || terms.cheque.file!.url)} />
                  <Button size="sm" variant="ghost" icon="close" label="Remove" onPress={() => setTerms((prev) => ({ ...prev, cheque: { ...prev.cheque, file: null } }))} />
                </View>
              ) : null}
              <Button size="sm" variant="secondary" icon="cloud-upload-outline" label={chequeBusy ? "Uploading…" : terms.cheque.file?.url ? "Replace cheque copy" : "Upload cheque copy"} disabled={chequeBusy} onPress={() => setChequePick(true)} />
            </Card>
            <Field label="Total capacity" value={`${capacity} seater`} editable={false} hint="Cabins are let whole, not by the seat" />
            <Field label="Notes" value={terms.notes} onChangeText={setTerm("notes")} placeholder="Anything the community manager should know on day one" multiline />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Card style={styles.gap}>
              <Text variant="tiny" color="muted" style={styles.caps}>
                CLIENT
              </Text>
              <Text variant="bodyStrong">{clientName || "Not named yet"}</Text>
              <Text variant="small" color="muted">
                {[form.contactPerson, form.signingAuthority2 || form.secondPersonName, form.phone, resolveIndustry(form)].filter(Boolean).join(" · ") || "New client record"}
              </Text>
            </Card>
            <Card style={[styles.gap, { backgroundColor: kyc.complete ? colors.successSoft : colors.warningSoft }]}>
              <Text variant="smallStrong" color={kyc.complete ? colors.success : colors.warning}>
                {kyc.complete ? `KYC complete - all ${kyc.required} required documents on file` : `${kyc.uploaded} of ${kyc.required} required documents on file`}
              </Text>
              {!kyc.complete ? (
                <Text variant="tiny" color={colors.warning}>
                  Outstanding: {kyc.missing.map((doc) => doc.label).join(", ")}.
                </Text>
              ) : null}
            </Card>
            {!editMode ? (
              <Card style={styles.gap}>
                <Text variant="tiny" color="muted" style={styles.caps}>
                  WHAT CHANGES ON CONFIRM
                </Text>
                {[
                  `${cabins.length} ${cabins.length === 1 ? "cabin flips" : "cabins flip"} to Booked on the board`,
                  `Seating for ${capacity} goes to ${clientName || "the client"}`,
                  `A ${terms.termMonths}-month agreement is raised from ${formatDate(terms.startDate)}`,
                  `First invoice of ${rupees(rent + deposit)} is scheduled, rent plus deposit`,
                ].map((line) => (
                  <Text key={line} variant="small">
                    ✓ {line}
                  </Text>
                ))}
              </Card>
            ) : null}
            {terms.notes ? (
              <Text variant="small" color="muted">
                {terms.notes}
              </Text>
            ) : null}
          </>
        ) : null}

        {summary}
        {blocker ? (
          <Text variant="small" color={colors.warning}>
            {blocker}
          </Text>
        ) : null}
        <InlineError message={localError || actionError} />
      </Body>
      <FooterBar>
        <Button label="Back" variant="secondary" style={styles.flex} disabled={!step || busy} onPress={() => setStep(step - 1)} />
        {step < STEPS.length - 1 ? (
          <Button label={`Next: ${STEPS[step + 1]}`} style={styles.wide} disabled={Boolean(blocker)} onPress={() => setStep(step + 1)} />
        ) : (
          <Button label={editMode ? "Save client and agreement" : "Confirm and allot"} icon="person-add" style={styles.wide} loading={busy} disabled={!validTerms || !validBirth} onPress={confirm} />
        )}
      </FooterBar>
      <ActionSheet
        visible={chequePick}
        title="Deposit cheque copy"
        onClose={() => setChequePick(false)}
        actions={[
          { key: "camera", label: "Take a photo", icon: "camera-outline", onPress: () => attachCheque(() => pickImage("camera")) },
          { key: "library", label: "Photo from gallery", icon: "image-outline", onPress: () => attachCheque(() => pickImage("library")) },
          { key: "file", label: "PDF or file", icon: "document-outline", onPress: () => attachCheque(pickDocument) },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wide: { flex: 2 },
  stepper: { gap: 8 },
  stepBars: { flexDirection: "row", gap: 6 },
  stepBar: { flex: 1, height: 5, borderRadius: 3 },
  pair: { flexDirection: "row", gap: 8 },
  gap: { gap: 8 },
  summary: { gap: 6 },
  caps: { letterSpacing: 0.6, fontFamily: "PlusJakartaSans_700Bold" },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  divider: { borderTopWidth: 1, paddingTop: 6, marginTop: 2 },
});
