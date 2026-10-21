import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Alert, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BannerAd, BannerAdSize, TestIds, InterstitialAd, AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

const bannerId = TestIds.BANNER;
const interstitialId = TestIds.INTERSTITIAL;
const rewardedId = TestIds.REWARDED;

const interstitial = InterstitialAd.createForAdRequest(interstitialId);
const rewarded = RewardedAd.createForAdRequest(rewardedId);

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [coins, setCoins] = useState(0);

  // Coins load cheyadam
  useEffect(() => {
    AsyncStorage.getItem('coins').then(val => {
      if(val) setCoins(parseInt(val));
    });
    interstitial.load();
    rewarded.load();

    const unsubRewarded = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
      const newCoins = coins + 20;
      setCoins(newCoins);
      AsyncStorage.setItem('coins', newCoins.toString());
      Alert.alert('Congrats!', '20 Coins vachayi!');
    });
    rewarded.addAdEventListener(AdEventType.CLOSED, () => rewarded.load());
    interstitial.addAdEventListener(AdEventType.CLOSED, () => interstitial.load());

    return () => unsubRewarded();
  }, [coins]);

  const addCoins = async (num) => {
    const newCoins = coins + num;
    setCoins(newCoins);
    await AsyncStorage.setItem('coins', newCoins.toString());
  };

  if (!permission) return <View style={{flex:1, backgroundColor:'black'}} />;
  if (!permission.granted) {
    requestPermission();
    return <View style={{flex:1, backgroundColor:'black'}} />;
  }

  const handleScan = (result) => {
    if (scanned) return;
    setScanned(true);
    const data = result.data;
    if (data) {
      addCoins(10);
      if (data.startsWith('upi://') || data.startsWith('http')) {
        Linking.openURL(data);
        if(interstitial.loaded) interstitial.show();
      } else {
        Alert.alert('QR Data', data);
      }
    }
    setTimeout(() => setScanned(false), 2000);
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" onBarcodeScanned={handleScan} barcodeScannerSettings={{barcodeTypes: ["qr"]}} />
      
      {/* Top Coins View */}
      <View style={styles.topBar}>
        <Text style={styles.coinText}>🪙 Coins: {coins}</Text>
        <TouchableOpacity style={styles.watchAdBtn} onPress={() => { if(rewarded.loaded) rewarded.show(); else Alert.alert('Ad loading... wait'); }}>
          <Text style={styles.btnText}>Watch Ad +20 Coins</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.adContainer}>
        <BannerAd unitId={bannerId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1, width: '100%' },
  topBar: { position: 'absolute', top: 50, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coinText: { color: 'white', backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 20, fontWeight: 'bold', fontSize: 16 },
  watchAdBtn: { backgroundColor: '#FFD700', padding: 10, borderRadius: 20 },
  btnText: { color: 'black', fontWeight: 'bold' },
  adContainer: { position: 'absolute', bottom: 0, width: '100%', alignItems: 'center' }
});
