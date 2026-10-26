// Android 11+ లో ఇతర యాప్‌లను (PhonePe, GPay) చూడగలిగేలా అనుమతి ఇస్తుంది
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = ['com.phonepe.app', 'com.google.android.apps.nbu.paisa.user'];

module.exports = function withQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!Array.isArray(manifest.queries)) manifest.queries = [];
    if (manifest.queries.length === 0) manifest.queries.push({});
    const q = manifest.queries[0];
    if (!Array.isArray(q.package)) q.package = [];
    PACKAGES.forEach((p) => {
      const exists = q.package.some((x) => x.$ && x.$['android:name'] === p);
      if (!exists) q.package.push({ $: { 'android:name': p } });
    });
    return cfg;
  });
};
