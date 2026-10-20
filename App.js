import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  AppState,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// =====================================================================
// యాడ్ సెట్టింగ్స్ (AdMob settings)
// ---------------------------------------------------------------------
// ఇప్పుడు USE_TEST_ADS = true ఉంది, అంటే టెస్ట్ యాడ్స్ వస్తాయి (డబ్బు రాదు).
// మీ AdMob ఖాతా ఆమోదం అయ్యాక, క్రింద మీ యాడ్ యూనిట్ IDలు పెట్టి
// USE_TEST_ADS ని false చేయండి.
// =====================================================================
const USE_TEST_ADS = true;

const MY_AD_UNITS = {
  banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
  interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
  rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
};

const AD_IDS = USE_TEST_ADS
  ? {
      banner: TestIds.ADAPTIVE_BANNER,
      interstitial: TestIds.INTERSTITIAL,
      rewarded: TestIds.REWARDED,
    }
  : MY_AD_UNITS;

const DAILY_REWARD_LIMIT = 3; // రోజుకు రివార్డ్ యాడ్స్
const COINS_PER_REWARD = 10; // ప్రతి రివార్డ్ యాడ్‌కు కాయిన్స్
const INTERSTITIAL_EVERY = 2; // ప్రతి 2 పేమెంట్లకు ఒక యాడ్

const todayStr = () => new Date().toDateString();

const saveValue = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch (e) {
    // ignore
  }
};

function MainScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const [adsReady, setAdsReady] = useState(false);
  const [rewardedLoaded, setRewardedLoaded] = useState(false);

  const [coins, setCoins] = useState(0);
  const [payments, setPayments] = useState(0);
  const [rewardUsed, setRewardUsed] = useState(0);

  const coinsRef = useRef(0);
  const paymentsRef = useRef(0);
  const rewardUsedRef = useRef(0);
  const pendingPaymentRef = useRef(false);

  const interstitialRef = useRef(null);
  const interstitialLoadedRef = useRef(false);
  const rewardedRef = useRef(null);

  // ---------- సేవ్ చేసిన డేటా లోడ్ ----------
  useEffect(() => {
    (async () => {
      try {
        const c = parseInt((await AsyncStorage.getItem('coins')) || '0', 10) || 0;
        const p = parseInt((await AsyncStorage.getItem('payments')) || '0', 10) || 0;
        const d = await AsyncStorage.getItem('rewardDate');
        let r = parseInt((await AsyncStorage.getItem('rewardUsed')) || '0', 10) || 0;
        if (d !== todayStr()) {
          r = 0;
        }
        coinsRef.current = c;
        paymentsRef.current = p;
        rewardUsedRef.current = r;
        setCoins(c);
        setPayments(p);
        setRewardUsed(r);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // ---------- AdMob మొదలుపెట్టడం ----------
  useEffect(() => {
    let alive = true;
    mobileAds()
      .initialize()
      .then(() => {
        if (alive) setAdsReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ---------- Interstitial యాడ్ ----------
  useEffect(() => {
    if (!adsReady) return undefined;
    const ad = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialRef.current = ad;

    const u1 = ad.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoadedRef.current = true;
    });
    const u2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoadedRef.current = false;
      ad.load();
    });
    const u3 = ad.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoadedRef.current = false;
    });
    ad.load();

    return () => {
      u1();
      u2();
      u3();
    };
  }, [adsReady]);

  // ---------- Rewarded యాడ్ ----------
  useEffect(() => {
    if (!adsReady) return undefined;
    const ad = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
      requestNonPersonalizedAdsOnly: true,
    });
    rewardedRef.current = ad;
    let retryTimer = null;

    const u1 = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setRewardedLoaded(true);
    });
    const u2 = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      const newCoins = coinsRef.current + COINS_PER_REWARD;
      const newUsed = rewardUsedRef.current + 1;
      coinsRef.current = newCoins;
      rewardUsedRef.current = newUsed;
      setCoins(newCoins);
      setRewardUsed(newUsed);
      saveValue('coins', newCoins);
      saveValue('rewardUsed', newUsed);
      saveValue('rewardDate', todayStr());
    });
    const u3 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setRewardedLoaded(false);
      ad.load();
    });
    const u4 = ad.addAdEventListener(AdEventType.ERROR, () => {
      setRewardedLoaded(false);
      retryTimer = setTimeout(() => ad.load(), 30000);
    });
    ad.load();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      u1();
      u2();
      u3();
      u4();
    };
  }, [adsReady]);

  // ---------- UPI యాప్ నుంచి తిరిగి వచ్చినప్పుడు ----------
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pendingPaymentRef.current) {
        pendingPaymentRef.current = false;
        Alert.alert('పేమెంట్ పూర్తయిందా?', 'మీరు పేమెంట్ చేశారా?', [
          { text: 'లేదు', style: 'cancel' },
          { text: 'అవును', onPress: onPaymentDone },
        ]);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPaymentDone = () => {
    const n = paymentsRef.current + 1;
    paymentsRef.current = n;
    setPayments(n);
    saveValue('payments', n);

    if (n % INTERSTITIAL_EVERY === 0 && interstitialLoadedRef.current && interstitialRef.current) {
      try {
        interstitialRef.current.show();
      } catch (e) {
        // ignore
      }
    }
  };

  // ---------- QR స్కాన్ ----------
  const startScan = async () => {
    if (!permission || !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('కెమెరా అనుమతి కావాలి', 'సెట్టింగ్స్‌లో కెమెరా అనుమతి ఇవ్వండి.');
        return;
      }
    }
    setScanned(false);
    setScanning(true);
  };

  const handleScan = useCallback(async ({ data }) => {
    setScanned(true);
    const text = String(data || '').trim();

    if (text.toLowerCase().startsWith('upi://')) {
      pendingPaymentRef.current = true;
      setScanning(false);
      try {
        await Linking.openURL(text);
      } catch (e) {
        pendingPaymentRef.current = false;
        Alert.alert('UPI యాప్ దొరకలేదు', 'మీ ఫోన్‌లో PhonePe / Paytm / GPay లాంటి యాప్ ఉండాలి.');
      }
    } else {
      Alert.alert('ఇది UPI QR కాదు', 'దయచేసి పేమెంట్ QR కోడ్ స్కాన్ చేయండి.', [
        { text: 'మళ్లీ స్కాన్', onPress: () => setScanned(false) },
        { text: 'రద్దు', style: 'cancel', onPress: () => setScanning(false) },
      ]);
    }
  }, []);

  // ---------- Rewarded యాడ్ చూపించడం ----------
  const watchRewarded = () => {
    if (rewardedRef.current == null) return;
    if (rewardUsedRef.current >= DAILY_REWARD_LIMIT) {
      Alert.alert('ఈరోజు అయిపోయింది', 'రేపు మళ్లీ రివార్డ్ యాడ్స్ చూడవచ్చు.');
      return;
    }
    if (!rewardedLoaded) {
      Alert.alert('కొంచెం ఆగండి', 'యాడ్ లోడ్ అవుతోంది, కొద్దిసేపటి తర్వాత ప్రయత్నించండి.');
      return;
    }
    try {
      rewardedRef.current.show();
    } catch (e) {
      // ignore
    }
  };

  // రోజు మారితే రివార్డ్ లెక్క 0 చేయడం
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const d = await AsyncStorage.getItem('rewardDate');
        if (d && d !== todayStr()) {
          rewardUsedRef.current = 0;
          setRewardUsed(0);
          saveValue('rewardUsed', 0);
          saveValue('rewardDate', todayStr());
        }
      } catch (e) {
        // ignore
      }
    });
    return () => sub.remove();
  }, []);

  const rewardLeft = Math.max(0, DAILY_REWARD_LIMIT - rewardUsed);

  // =============== స్కానర్ స్క్రీన్ ===============
  if (scanning) {
    return (
      <View style={styles.cameraWrap}>
        <StatusBar barStyle="light-content" />
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleScan}
        />
        <View style={[styles.cameraTop, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.cameraHint}>QR కోడ్‌ను ఫ్రేమ్ మధ్యలో ఉంచండి</Text>
        </View>
        <View style={styles.frame} />
        <TouchableOpacity
          style={[styles.cancelBtn, { bottom: insets.bottom + 24 }]}
          onPress={() => setScanning(false)}
        >
          <Text style={styles.cancelText}>వెనక్కి</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // =============== హోమ్ స్క్రీన్ ===============
  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>QR పే స్కానర్</Text>
      <Text style={styles.subtitle}>QR స్కాన్ చేయండి, UPI యాప్‌లో పేమెంట్ చేయండి</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{payments}</Text>
          <Text style={styles.statLabel}>పేమెంట్లు</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{coins}</Text>
          <Text style={styles.statLabel}>కాయిన్స్</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.scanBtn} onPress={startScan}>
        <Text style={styles.scanBtnText}>📷  QR స్కాన్ చేయండి</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.rewardBtn, (rewardLeft === 0 || !rewardedLoaded) && styles.rewardBtnOff]}
        onPress={watchRewarded}
      >
        <Text style={styles.rewardBtnText}>
          🎁 యాడ్ చూసి {COINS_PER_REWARD} కాయిన్స్ పొందండి
        </Text>
        <Text style={styles.rewardSub}>
          {rewardLeft > 0
            ? `ఈరోజు మిగిలినవి: ${rewardLeft}/${DAILY_REWARD_LIMIT}`
            : 'ఈరోజు అయిపోయాయి, రేపు రండి'}
        </Text>
      </TouchableOpacity>

      <View style={{ flex: 1 }} />

      {adsReady ? (
        <View style={[styles.bannerWrap, { paddingBottom: insets.bottom }]}>
          <BannerAd
            unitId={AD_IDS.banner}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1B1F3B',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#5A6078',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    elevation: 2,
  },
  statNumber: {
    fontSize: 30,
    fontWeight: '800',
    color: '#4B3FE0',
  },
  statLabel: {
    fontSize: 14,
    color: '#5A6078',
    marginTop: 4,
  },
  scanBtn: {
    backgroundColor: '#4B3FE0',
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  rewardBtn: {
    backgroundColor: '#FF9F1C',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  rewardBtnOff: {
    opacity: 0.55,
  },
  rewardBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  rewardSub: {
    color: '#FFF3DC',
    fontSize: 13,
    marginTop: 4,
  },
  bannerWrap: {
    alignItems: 'center',
    marginHorizontal: -20,
    backgroundColor: '#FFFFFF',
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cameraHint: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  frame: {
    position: 'absolute',
    top: '30%',
    left: '15%',
    width: '70%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 20,
  },
  cancelBtn: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B1F3B',
  },
});
