const MAIN_OFFICE_NAME = "Main office";

const isUsableOffice = (office) =>
  Number.isFinite(office?.latitude)
  && Number.isFinite(office?.longitude)
  && Number(office?.radiusMeters) > 0;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const calculateDistanceMeters = (first, second) => {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(second.latitude - first.latitude);
  const deltaLon = toRadians(second.longitude - first.longitude);
  const firstLat = toRadians(first.latitude);
  const secondLat = toRadians(second.latitude);

  const haversine =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(
    earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
};

/*
 * The offices one person may check in from: the main office for everybody,
 * plus each further office that lists them. Offices without usable
 * coordinates are left out rather than refusing everyone.
 */
const resolveCheckInOffices = (policy = {}, userId) => {
  const id = String(userId || "");
  const main = {
    id: "",
    name: MAIN_OFFICE_NAME,
    latitude: policy.officeLatitude,
    longitude: policy.officeLongitude,
    radiusMeters: Number(policy.officeRadiusMeters),
  };
  const extra = (Array.isArray(policy.offices) ? policy.offices : [])
    .filter((office) => (office.userIds || []).some((allowed) => String(allowed) === id))
    .map((office) => ({
      id: String(office._id || ""),
      name: office.name || "Office",
      latitude: office.latitude,
      longitude: office.longitude,
      radiusMeters: Number(office.radiusMeters),
    }));
  return [main, ...extra].filter(isUsableOffice);
};

/*
 * Measures a location against each office. The reported GPS accuracy comes
 * off the distance, capped, so a weak fix at the door is not refused. Returns
 * the nearest office the location is inside, if any, and otherwise the office
 * it came closest to reaching, for the refusal message.
 */
const matchOfficeGeofence = ({ offices, location, maxAccuracyBufferMeters }) => {
  const accuracyBufferMeters = Math.min(
    maxAccuracyBufferMeters,
    Math.max(0, Number(location?.accuracy || 0)),
  );
  const measured = offices.map((office) => {
    const distanceMeters = calculateDistanceMeters(office, location);
    const effectiveDistanceMeters = Math.max(0, distanceMeters - accuracyBufferMeters);
    return { office, distanceMeters, effectiveDistanceMeters };
  });
  const shortfall = (row) => row.effectiveDistanceMeters - row.office.radiusMeters;
  const byShortfall = [...measured].sort((left, right) => shortfall(left) - shortfall(right));
  const match = measured
    .filter((row) => shortfall(row) <= 0)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] || null;
  return { match, nearest: byShortfall[0] || null, accuracyBufferMeters };
};

module.exports = {
  MAIN_OFFICE_NAME,
  calculateDistanceMeters,
  matchOfficeGeofence,
  resolveCheckInOffices,
};
