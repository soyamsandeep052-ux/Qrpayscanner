import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BannerAd, BannerAdSize, TestIds, InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';

const bannerId = TestIds.BANNER;
const interstitialId = TestIds.INTERSTITIAL;
const interstitial = InterstitialAd.createForAdRequest(interstitialId);

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const unsubscribe = interstitial.addAdEventListener(AdEventType.LOADED, () => {});
    interstitial.load();
    return unsubscribe;
  }, []);

  const startScan = async () => {
    const res = await requestPermission();
    if (!res.granted) {
      Alert.alert("Camera Permission Kavali");
      return;
    }
    setScanned(false);
    setScanning(true);
  };

  const onScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setScanning(false);
    Vibration.vibrate(100);

    if (interstitial.loaded) {
      interstitial.show();
      interstitial.load();
    }

    if (data.startsWith('upi://')) {
      Linking.openURL(data);
    } else {
      Linking.openURL(data).catch(() => Alert.alert("Scan", data));
    }
  };

  return (
    <View style={styles.container}>
      {scanning ? (
        <CameraView 
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : onScanned}
        >
          <View style={styles.overlay}>
            <Text style={styles.scanText}>QR Meeda Pettandi</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanning(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      ) : (
        <View style={styles.center}>
          <Text style={styles.title}>QR Pay Scanner</Text>
          <Text style={styles.sub}>UPI QR ni Instant ga Scan chey</Text>
          <TouchableOpacity style={styles.scanBtn} onPress={startScan}>
            <Text style={styles.btnText}>SCAN CHEYI</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.banner}>
        <BannerAd unitId={bannerId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 10 },
  sub: { color: '#94a3b8', fontSize: 16, marginBottom: 30 },
  scanBtn: { backgroundColor: '#22c55e', paddingVertical: 18, paddingHorizontal: 50, borderRadius: 15 },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 18 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 },
  scanText: { color: '#fff', fontSize: 18, marginBottom: 20, fontWeight: '600' },
  cancelBtn: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 30 },
  cancelText: { color: '#000', fontWeight: 'bold' },
  banner: { position: 'absolute', bottom: 0, width: '100%', alignItems: 'center' }
});
