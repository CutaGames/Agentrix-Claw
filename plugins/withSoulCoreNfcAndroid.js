const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Keep NFC optional at install time: Agentrix remains usable without hardware,
 * while Android devices with NFC can run the Soul Core IsoDep flow.
 * react-native-nfc-manager owns android.permission.NFC; this plugin owns only
 * the uses-feature declaration that its upstream Expo plugin does not add.
 */
module.exports = function withSoulCoreNfcAndroid(config) {
  return withAndroidManifest(config, (next) => {
    const manifest = next.modResults.manifest;
    const features = manifest['uses-feature'] || [];
    const alreadyDeclared = features.some(
      (feature) => feature?.$?.['android:name'] === 'android.hardware.nfc',
    );
    if (!alreadyDeclared) {
      features.push({
        $: {
          'android:name': 'android.hardware.nfc',
          'android:required': 'false',
        },
      });
    }
    manifest['uses-feature'] = features;
    return next;
  });
};
