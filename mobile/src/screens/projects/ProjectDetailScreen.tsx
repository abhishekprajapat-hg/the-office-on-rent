import React, { useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { errorMessage, mediaUrl } from "../../api/client";
import { deleteProject, getProject, humanize, projectOccupancy, type ProjectUnit } from "../../api/projects";
import { canManagePage } from "../../api/access";
import { useAuth, useUser } from "../../auth/AuthProvider";
import { dialable } from "../../lib/format";
import { formatPrice } from "../../lib/money";
import { isManagement } from "../../lib/roles";
import { useQuery } from "../../lib/useQuery";
import type { RootStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeProvider";
import type { Tone } from "../../theme/tokens";
import { Badge, Body, Button, Card, ErrorState, FactRow, GroupLabel, IconTile, InlineError, ListCard, ListRow, Loading, MiniStat, ProgressBar, Text } from "../../ui";
import { PROJECT_STATUS_TONE } from "./ProjectsScreen";

const UNIT_TONE: Record<string, Tone> = { AVAILABLE: "success", BOOKED: "warning", SOLD: "neutral", LEASED: "primary", RESERVED: "violet" };

/* Project page: rates, unit inventory by status, BHK mix, amenities, contacts. Web: ProjectDetails. */
export const ProjectDetailScreen = () => {
  const { params } = useRoute<RouteProp<RootStackParamList, "ProjectDetail">>();
  const navigation = useNavigation();
  const user = useUser();
  const { access } = useAuth();
  const canEdit = canManagePage(user, access, "projects", "edit");
  const { colors } = useTheme();
  const { data: project, loading, error, refreshing, refresh } = useQuery(() => getProject(params.id), [params.id]);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error || !project) return <ErrorState message={error || "Project not found."} onRetry={refresh} />;

  const occ = projectOccupancy(project);
  const groups: { label: string; code: keyof ProjectUnit; units: ProjectUnit[] }[] = [
    { label: "Offices", code: "officeCode", units: project.offices || [] },
    { label: "Shops", code: "shopCode", units: project.shops || [] },
    { label: "Showrooms", code: "showroomCode", units: project.showrooms || [] },
  ].filter((group) => group.units.length) as never;
  const allUnits = groups.flatMap((group) => group.units);
  const countOf = (status: string) => allUnits.filter((unit) => String(unit.status).toUpperCase() === status).length;
  const rate = (value?: number | null) => (value ? formatPrice(value) : "—");

  const remove = async () => {
    if (!confirm) return setConfirm(true);
    setActionError(null);
    try {
      const result = await deleteProject(project._id);
      if (result.approvalRequired) {
        setNotice(result.message || "Delete request sent to an admin.");
        setConfirm(false);
      } else navigation.goBack();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <Body refreshing={refreshing} onRefresh={refresh}>
      {project.images?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {project.images.map((uri) => (
            <Image key={uri} source={{ uri: mediaUrl(uri) }} style={[styles.photo, { backgroundColor: colors.surfaceAlt }]} />
          ))}
        </ScrollView>
      ) : null}

      <Card style={styles.hero}>
        <View style={styles.badges}>
          {project.status ? <Badge label={humanize(project.status)} tone={PROJECT_STATUS_TONE[project.status] || "neutral"} /> : null}
          <Badge label={humanize(project.projectCategory)} tone="primary" />
          {project.projectType ? <Badge label={humanize(project.projectType)} /> : null}
        </View>
        <Text variant="title">{project.projectName}</Text>
        <Text variant="small" color="muted">
          {[project.projectId, project.location, project.landmark, project.city, project.state, project.pincode].filter(Boolean).join(" · ")}
        </Text>
        {occ ? (
          <View style={styles.occ}>
            <View style={styles.occHead}>
              <Text variant="small" color="muted">
                {occ.taken} of {occ.total} {occ.noun} {occ.verb}
              </Text>
              <Text variant="smallStrong">{occ.total ? Math.round((occ.taken / occ.total) * 100) : 0}%</Text>
            </View>
            <ProgressBar value={occ.total ? occ.taken / occ.total : 0} />
          </View>
        ) : null}
      </Card>

      {allUnits.length ? (
        <View style={styles.stats}>
          <MiniStat value={countOf("AVAILABLE")} label="Available" tone="success" />
          <MiniStat value={countOf("BOOKED")} label="Booked" tone="warning" />
          <MiniStat value={countOf("LEASED")} label="Leased" tone="primary" />
          <MiniStat value={countOf("SOLD")} label="Sold" />
        </View>
      ) : null}

      <GroupLabel>Pricing</GroupLabel>
      <Card style={styles.facts}>
        <FactRow label="Starting rate" value={rate(project.startingRate)} />
        <FactRow label="Current rate" value={rate(project.currentRate)} />
        {/* Free text on the server ("₹200/sq ft", "As applicable"); a bare number reads as a price. */}
        {project.plc ? <FactRow label="PLC" value={typeof project.plc === "number" || /^\d+(\.\d+)?$/.test(project.plc) ? rate(Number(project.plc)) : project.plc} /> : null}
        {project.plcWideRoad ? <FactRow label="Wide Road PLC" value={project.plcWideRoad} /> : null}
        {project.plcGardenFacing ? <FactRow label="Garden Facing PLC" value={project.plcGardenFacing} /> : null}
        {project.plcCorner ? <FactRow label="Corner Plot PLC" value={project.plcCorner} /> : null}
        {project.plcGardenCorner ? <FactRow label="Garden Facing + Corner PLC" value={project.plcGardenCorner} /> : null}
        {project.developmentCharges ? <FactRow label="Development charges" value={project.developmentCharges} /> : null}
        {project.maintenanceCharges ? <FactRow label="Maintenance charges" value={project.maintenanceCharges} /> : null}
        {project.amenityCharges ? <FactRow label="Amenity charges" value={project.amenityCharges} /> : null}
        {project.utilityCharges ? <FactRow label="Utilities (water / electricity connection)" value={project.utilityCharges} /> : null}
        {project.parkingCharges ? <FactRow label="Parking charges" value={project.parkingCharges} /> : null}
        {project.taxes ? <FactRow label="Taxes (GST etc.)" value={project.taxes} /> : null}
        {project.registrationStampDuty ? <FactRow label="Registration / stamp duty" value={project.registrationStampDuty} /> : null}
        {project.otherCharges ? (
          <FactRow label="Other charges" value={typeof project.otherCharges === "number" || /^\d+(\.\d+)?$/.test(project.otherCharges) ? rate(Number(project.otherCharges)) : project.otherCharges} />
        ) : null}
      </Card>

      <GroupLabel>Project</GroupLabel>
      <Card style={styles.facts}>
        {project.totalLandArea ? <FactRow label="Land area" value={`${project.totalLandArea.toLocaleString("en-IN")} sq ft`} /> : null}
        {project.totalFloors || project.numberOfFloors ? <FactRow label="Floors" value={String(project.totalFloors || project.numberOfFloors)} /> : null}
        {project.numberOfFlats ? <FactRow label="Flats" value={String(project.numberOfFlats)} /> : null}
        {project.totalPlots ? <FactRow label="Plots" value={`${project.totalPlots} · ${project.plotsAvailable ?? "—"} available`} /> : null}
        {project.plotSizeMin != null || project.plotSizeMax != null ? (
          <FactRow
            label="Plot size range"
            value={project.plotSizeMin != null && project.plotSizeMax != null
              ? (project.plotSizeMin === project.plotSizeMax ? `${project.plotSizeMin} sq ft` : `${project.plotSizeMin} – ${project.plotSizeMax} sq ft`)
              : project.plotSizeMin != null ? `From ${project.plotSizeMin} sq ft` : `Up to ${project.plotSizeMax} sq ft`}
          />
        ) : project.plotSize ? <FactRow label="Plot size" value={project.plotSize === "CUSTOM" ? `${project.customPlotSize || "—"} sq ft` : `${project.plotSize} sq ft`} /> : null}
        {project.totalOffices ? <FactRow label="Offices" value={String(project.totalOffices)} /> : null}
        {project.totalShops ? <FactRow label="Shops" value={String(project.totalShops)} /> : null}
        {project.totalShowrooms ? <FactRow label="Showrooms" value={String(project.totalShowrooms)} /> : null}
        {project.housingCategory ? <FactRow label="Housing" value={humanize(project.housingCategory)} /> : null}
      </Card>

      {project.bhkConfigurations?.length ? (
        <>
          <GroupLabel>Configurations</GroupLabel>
          <ListCard>
            {project.bhkConfigurations.map((config, index) => (
              <ListRow
                key={index}
                title={humanize(config.bhk).replace("_", ".")}
                subtitle={[`${config.size} sq ft`, config.bedrooms ? `${config.bedrooms} bed` : "", config.washrooms ? `${config.washrooms} bath` : "", config.balconies ? `${config.balconies} balcony` : ""].filter(Boolean).join(" · ")}
                left={<IconTile icon="home" tone="violet" />}
              />
            ))}
          </ListCard>
        </>
      ) : null}

      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <GroupLabel>{`${group.label} · ${group.units.length}`}</GroupLabel>
          <ListCard>
            {group.units.map((unit, index) => {
              const status = String(unit.status || "AVAILABLE").toUpperCase();
              return (
                <View key={unit._id || index} style={styles.unit}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" style={styles.unitTitle}>
                      {String(unit[group.code] || unit.officeName || `#${index + 1}`)}
                    </Text>
                    <Text variant="small" color="muted" style={styles.unitSub}>
                      {[
                        unit.floorNumber !== null && unit.floorNumber !== undefined ? `Floor ${unit.floorNumber}` : "",
                        unit.carpetArea ? `${unit.carpetArea} sq ft` : "",
                        unit.facing ? humanize(unit.facing) : "",
                        unit.currentRate ? formatPrice(unit.currentRate) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Badge label={humanize(status)} tone={UNIT_TONE[status] || "neutral"} />
                </View>
              );
            })}
          </ListCard>
        </View>
      ))}

      {project.amenities?.length || project.otherFacilities ? (
        <>
          <GroupLabel>Amenities & infrastructure</GroupLabel>
          <View style={styles.badges}>
            {(project.amenities || []).map((item) => (
              <Badge key={item} label={humanize(item)} />
            ))}
          </View>
          {project.otherFacilities ? <Body>Other facilities: {project.otherFacilities}</Body> : null}
        </>
      ) : null}

      {project.ownerManagerName || project.brokerManagerName ? (
        <>
          <GroupLabel>Contacts</GroupLabel>
          <ListCard>
            {project.ownerManagerName ? (
              <ListRow
                title={project.ownerManagerName}
                subtitle={`Owner's manager · ${project.ownerManagerMobile || ""}`}
                left={<IconTile icon="person" tone="violet" />}
                onPress={project.ownerManagerMobile ? () => Linking.openURL(`tel:${dialable(project.ownerManagerMobile)}`) : undefined}
                chevron={Boolean(project.ownerManagerMobile)}
              />
            ) : null}
            {project.brokerManagerName ? (
              <ListRow
                title={project.brokerManagerName}
                subtitle={`Broker's manager · ${project.brokerManagerMobile || ""}`}
                left={<IconTile icon="briefcase" tone="warning" />}
                onPress={project.brokerManagerMobile ? () => Linking.openURL(`tel:${dialable(project.brokerManagerMobile)}`) : undefined}
                chevron={Boolean(project.brokerManagerMobile)}
              />
            ) : null}
          </ListCard>
        </>
      ) : null}

      {project.siteLocation?.lat && project.siteLocation?.lng ? (
        <Button
          variant="secondary"
          icon="navigate"
          label="Directions"
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${project.siteLocation!.lat},${project.siteLocation!.lng}`)}
        />
      ) : null}

      {notice ? (
        <Text variant="small" color="primary" align="center">
          {notice}
        </Text>
      ) : null}
      <InlineError message={actionError} />
      {canEdit ? <Button variant="secondary" icon="create-outline" label="Edit project" onPress={() => navigation.navigate("ProjectForm", { id: project._id })} /> : null}
      {isManagement(user.role) ? (
        <Button variant="danger" icon="trash-outline" label={confirm ? "Tap again to delete" : "Delete project"} onPress={remove} />
      ) : null}
    </Body>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  photos: { gap: 8 },
  photo: { width: 220, height: 140, borderRadius: 16 },
  hero: { gap: 6, borderRadius: 22 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  occ: { gap: 5, marginTop: 6 },
  occHead: { flexDirection: "row", justifyContent: "space-between" },
  stats: { flexDirection: "row", gap: 6 },
  facts: { paddingVertical: 4 },
  group: { gap: 8 },
  unit: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  unitTitle: { fontSize: 13 },
  unitSub: { fontSize: 11.5 },
});
