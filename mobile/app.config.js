const fs = require("fs");
const path = require("path");

/*
 * Build-time settings app.json can't hold.
 *
 * Google Maps on Android needs an API key baked into the build: set
 * GOOGLE_MAPS_ANDROID_API_KEY (an EAS secret, or in the shell for a local
 * build). Without it Field ops draws its own map.
 *
 * Push notifications on Android go through Firebase Cloud Messaging, and a
 * build without Firebase's google-services.json can't get a push token at all
 * - which is why notifications never arrived. Upload the file as an EAS
 * "file" environment variable named GOOGLE_SERVICES_JSON (EAS hands the build
 * its path), or drop it next to this file as google-services.json for a local
 * build. See README.md, "Push notifications".
 */
module.exports = ({ config }) => {
  const android = { ...config.android };

  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (mapsKey) android.config = { ...(android.config || {}), googleMaps: { apiKey: mapsKey } };

  const localServices = path.join(__dirname, "google-services.json");
  const servicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localServices) ? "./google-services.json" : undefined);
  if (servicesFile) android.googleServicesFile = servicesFile;

  return { ...config, android };
};
