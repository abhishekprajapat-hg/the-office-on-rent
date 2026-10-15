/*
 * Build-time settings app.json can't hold. Google Maps on Android needs an API
 * key baked into the build: set GOOGLE_MAPS_ANDROID_API_KEY (an EAS secret, or
 * in the shell for a local build). Without it Field ops draws its own map.
 */
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!key) return config;
  return {
    ...config,
    android: { ...config.android, config: { ...(config.android?.config || {}), googleMaps: { apiKey: key } } },
  };
};
