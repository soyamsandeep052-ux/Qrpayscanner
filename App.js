import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Alert, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('coins').then(val => { if(val) setCoins(parseInt(val)); });
  }, []);

  const addCoins = async (num) => {
    const newCoins = coins + num;
    setCoins(newCoins);
    await AsyncStorage.setItem('coins', newCoins.toString());
  };

  if (!permission) return <View style={{flex:1, backgroundColor:'black'}} />;
  if (!permission.granted) { requestPermission(); return <View style={{flex:1}} />; }

  const handleScan = async ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);
    Vibration.vibrate();
    
    // Coins add
    addCoins(10);

    // Direct PhonePe ki pampadam
    try {
      if (data.startsWith('upi://')) {
        await Linking.openURL(data);
      } else if (data.startsWith('http')) {
        await Linking.openURL(data);
      } else {
        Alert.alert('QR Data', data);
      }
    } catch(e) {
      Alert.alert('Error', 'PhonePe app ledu emo, install chesava?');
    }
    
    setTimeout(() => setScanned(false), 3000);
  };

  return (
    <View style={styles.container}>
      <CameraView 
        style={styles.camera} 
        facing="back" 
        onBarcodeScanned={scanned ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        autofocus="on"
      />
      <View style={styles.topBar}>
        <Text style={styles.coinText}>🪙 Coins: {coins}</Text>
      </View>
      <View style={styles.box} />
      <Text style={styles.hint}>QR ni madhyalo pettu - auto PhonePe open avuthundi</Text>
      <View style={styles.adContainer}>
        <BannerAd unitId={TestIds.BANNER} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  topBar: { position: 'absolute', top: 50, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 20 },
  coinText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  box: { position: 'absolute', top: '30%', left: '10%', width: '80%', height: '35%', borderWidth: 3, borderColor: '#00FF00', borderRadius: 20 },
  hint: { position: 'absolute', top: '70%', alignSelf: 'center', color: 'white', backgroundColor: 'black', padding: 8, borderRadius: 10 },
  adContainer: { position: 'absolute', bottom: 0, width: '100%', alignItems: 'center' }
});
