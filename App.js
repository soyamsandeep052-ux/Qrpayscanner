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
import { Buffer } from 'buffer';
import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import { CameraView, Camera, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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

const APP_BUILD = 5; // యాప్ వెర్షన్ (ఏ వెర్షన్ ఇన్‌స్టాల్ అయిందో తెలుసుకోవడానికి)

const todayStr = () => new Date().toDateString();

if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = Buffer;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =====================================================================
// QR చదవడం - Google MLKit లేని ఫోన్లలో కూడా పనిచేసేలా
// ---------------------------------------------------------------------
// 1) ముందు ఫోన్‌లో MLKit ఉంటే అది వాడతాం (వేగంగా ఉంటుంది)
// 2) MLKit లేకపోతే (మీ ఫోన్‌లో లాగా), యాప్ సొంతంగా చదువుతుంది (jsQR)
// =====================================================================
let mlkitWorks = true;

const decodeWithMlkit = async (uri) => {
  if (!mlkitWorks) return '';
  const fn =
    (Camera && typeof Camera.scanFromURLAsync === 'function' && Camera.scanFromURLAsync) ||
    (typeof scanFromURLAsync === 'function' && scanFromURLAsync) ||
    null;
  if (!fn) {
    mlkitWorks = false;
    return '';
  }
  try {
    const results = await fn(uri, ['qr']);
    if (results && results.length > 0 && results[0].data) {
      return String(results[0].data).trim();
    }
    return '';
  } catch (e) {
    // ఈ ఫోన్‌లో MLKit లేదు - ఇక ప్రయత్నించం
    mlkitWorks = false;
    return '';
  }
};

const B64_TABLE = (() => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const t = new Uint8Array(256).fill(255);
  for (let i = 0; i < chars.length; i += 1) t[chars.charCodeAt(i)] = i;
  return t;
})();

const base64ToBytes = (b64) => {
  const vals = [];
  for (let i = 0; i < b64.length; i += 1) {
    const v = B64_TABLE[b64.charCodeAt(i) & 255];
    if (v !== 255) vals.push(v);
  }
  const out = new Uint8Array(Math.floor((vals.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < vals.length; i += 4) {
    const a = vals[i];
    const b = vals[i + 1];
    const c = vals[i + 2];
    const d = vals[i + 3];
    if (b !== undefined) out[p++] = (a << 2) | (b >> 4);
    if (c !== undefined) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
};

// ఫోటోని చిన్నదిగా చేసి JPEG (base64) గా మారుస్తుంది
const shrinkToJpegBase64 = async (uri, width) => {
  const IM = ImageManipulator.ImageManipulator;
  if (IM && typeof IM.manipulate === 'function') {
    const ctx = IM.manipulate(uri);
    ctx.resize({ width });
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.85,
      base64: true,
    });
    return saved.base64 || '';
  }
  const saved = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.85,
    base64: true,
  });
  return saved.base64 || '';
};

const decodeWithJs = async (uri, tryInverted) => {
  const widths = [900, 560];
  for (let i = 0; i < widths.length; i += 1) {
    const b64 = await shrinkToJpegBase64(uri, widths[i]);
    if (!b64) continue;
    const img = jpeg.decode(base64ToBytes(b64), { useTArray: true, formatAsRGBA: true });
    const pixels = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    const code = jsQR(pixels, img.width, img.height, {
      inversionAttempts: tryInverted ? 'attemptBoth' : 'dontInvert',
    });
    if (code && code.data) return String(code.data).trim();
  }
  return '';
};

// ఫోటో నుంచి QR చదివే ఫంక్షన్
const decodeQrFromImage = async (uri, tryInverted = true) => {
  const fromMlkit = await decodeWithMlkit(uri);
  if (fromMlkit) return fromMlkit;
  return decodeWithJs(uri, tryInverted);
};

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
  const [info, setInfo] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [scanDebug, setScanDebug] = useState('');
  const cameraRef = useRef(null);

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
  // QR లోని టెక్స్ట్ UPI లింక్ అయితే UPI యాప్ తెరుస్తుంది
  const openUpi = useCallback(async (text, fromInAppCamera) => {
    if (text.toLowerCase().startsWith('upi://')) {
      pendingPaymentRef.current = true;
      setScanning(false);
      try {
        await Linking.openURL(text);
      } catch (e) {
        pendingPaymentRef.current = false;
        Alert.alert('UPI యాప్ దొరకలేదు', 'మీ ఫోన్‌లో PhonePe / Paytm / GPay లాంటి యాప్ ఉండాలి.');
      }
    } else if (fromInAppCamera) {
      Alert.alert('ఇది UPI QR కాదు', 'దయచేసి పేమెంట్ QR కోడ్ స్కాన్ చేయండి.', [
        { text: 'మళ్లీ స్కాన్', onPress: () => setScanned(false) },
        { text: 'రద్దు', style: 'cancel', onPress: () => setScanning(false) },
      ]);
    } else {
      Alert.alert('ఇది UPI QR కాదు', 'దయచేసి పేమెంట్ QR కోడ్ స్కాన్ చేయండి.');
    }
  }, []);

  // Google స్కానర్ ఫలితం ఇక్కడికి వస్తుంది
  useEffect(() => {
    let sub = null;
    try {
      sub = CameraView.onModernBarcodeScanned((event) => {
        openUpi(String((event && event.data) || '').trim(), false);
      });
    } catch (e) {
      sub = null;
    }
    return () => {
      try {
        if (sub && sub.remove) sub.remove();
      } catch (e) {
        // ignore
      }
    };
  }, [openUpi]);

  const startScan = async () => {
    // ముందు Google స్కానర్ ప్రయత్నిస్తాం (ఫోకస్ బాగా ఉంటుంది)
    if (CameraView.isModernBarcodeScannerAvailable) {
      try {
        setInfo('');
        await CameraView.launchScanner({ barcodeTypes: ['qr'] });
        return;
      } catch (e) {
        // Google స్కానర్ తెరవలేదు - యాప్ సొంత కెమెరా స్కానర్ వాడతాం
        setInfo('');
      }
    } else {
      setInfo('');
    }
    if (!permission || !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('కెమెరా అనుమతి కావాలి', 'సెట్టింగ్స్‌లో కెమెరా అనుమతి ఇవ్వండి.');
        return;
      }
    }
    setScanned(false);
    setCameraReady(false);
    setScanDebug('');
    setScanning(true);
  };

  const handleScan = useCallback(
    async ({ data }) => {
      setScanned(true);
      await openUpi(String(data || '').trim(), true);
    },
    [openUpi]
  );

  // ---------- కెమెరా నుంచి వరుసగా ఫోటోలు తీసి QR వెతకడం ----------
  // (MLKit లేని ఫోన్లలో కూడా ఇది పనిచేస్తుంది)
  useEffect(() => {
    if (!scanning || !cameraReady || scanned) return undefined;
    let cancelled = false;

    const loop = async () => {
      let failures = 0;
      while (!cancelled) {
        try {
          if (cameraRef.current) {
            const pic = await cameraRef.current.takePictureAsync({
              quality: 0.5,
              skipProcessing: true,
              shutterSound: false,
              exif: false,
            });
            if (cancelled) return;
            const text = pic && pic.uri ? await decodeQrFromImage(pic.uri, false) : '';
            if (cancelled) return;
            failures = 0;
            if (text) {
              handleScan({ data: text });
              return;
            }
          }
        } catch (e) {
          failures += 1;
          if (!cancelled) setScanDebug('కెమెరా లోపం: ' + String((e && e.message) || e));
          if (failures >= 5) return;
        }
        await sleep(250);
      }
    };

    loop();
    return () => {
      cancelled = true;
    };
  }, [scanning, cameraReady, scanned, handleScan]);

  // ---------- ఫోన్ సొంత కెమెరాతో ఫోటో తీసి స్కాన్ ----------
  const scanFromPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('కెమెరా అనుమతి కావాలి', 'సెట్టింగ్స్‌లో కెమెరా అనుమతి ఇవ్వండి.');
        return;
      }
      setInfo('');
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const text = await decodeQrFromImage(res.assets[0].uri);
      if (!text) {
        Alert.alert(
          'QR కనిపించలేదు',
          'ఫోటో తీశాక QR చుట్టూ క్రాప్ చేయండి (QR ఫ్రేమ్ మొత్తం నిండాలి), ఫోకస్ బాగా ఉండాలి.'
        );
        return;
      }
      await openUpi(text, false);
    } catch (e) {
      Alert.alert('స్కాన్ లోపం', String((e && e.message) || e));
    }
  };

  // ---------- గ్యాలరీలోని QR ఫోటో/స్క్రీన్‌షాట్ నుంచి స్కాన్ ----------
  const scanFromGallery = async () => {
    try {
      setInfo('');
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const text = await decodeQrFromImage(res.assets[0].uri);
      if (!text) {
        Alert.alert('QR కనిపించలేదు', 'QR చుట్టూ క్రాప్ చేసి మళ్లీ ప్రయత్నించండి.');
        return;
      }
      await openUpi(text, false);
    } catch (e) {
      Alert.alert('స్కాన్ లోపం', String((e && e.message) || e));
    }
  };

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
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={[styles.cameraTop, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.cameraHint}>QR కోడ్‌ను ఫ్రేమ్ మధ్యలో ఉంచండి</Text>
          <Text style={styles.cameraSub}>
            ఫోన్‌ను స్థిరంగా పట్టుకోండి, కొద్ది సెకన్లలో స్కాన్ అవుతుంది
          </Text>
          {scanDebug ? <Text style={styles.cameraSub}>{scanDebug}</Text> : null}
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

      <View style={styles.altRow}>
        <TouchableOpacity style={styles.altBtn} onPress={scanFromPhoto}>
          <Text style={styles.altBtnText}>📸 ఫోటో తీసి స్కాన్</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.altBtn} onPress={scanFromGallery}>
          <Text style={styles.altBtnText}>🖼️ గ్యాలరీ నుంచి</Text>
        </TouchableOpacity>
      </View>

      {info ? <Text style={styles.infoText}>{info}</Text> : null}

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

      <Text style={styles.versionText}>వెర్షన్ {APP_BUILD}</Text>

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
  cameraSub: {
    color: '#DDDDDD',
    fontSize: 12,
    marginTop: 4,
  },
  altRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  altBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4B3FE0',
  },
  altBtnText: {
    color: '#4B3FE0',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#B3261E',
    textAlign: 'center',
    marginBottom: 12,
  },
  versionText: {
    fontSize: 11,
    color: '#8A90A6',
    textAlign: 'center',
    marginBottom: 4,
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
