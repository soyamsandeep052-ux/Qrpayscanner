import React, { useEffect, useRef, useState } from 'react';
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
import * as IntentLauncher from 'expo-intent-launcher';
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
const INTERSTITIAL_EVERY = 2; // ప్రతి 2వ సారి UPI యాప్ తెరవడానికి ముందు ఒక యాడ్

const APP_BUILD = 8; // యాప్ వెర్షన్

// మనం తెరిచే UPI యాప్‌లు
const UPI_APPS = [
  { key: 'phonepe', name: 'PhonePe', pkg: 'com.phonepe.app', color: '#5F259F' },
  { key: 'gpay', name: 'GPay', pkg: 'com.google.android.apps.nbu.paisa.user', color: '#1A73E8' },
];

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

  const [adsReady, setAdsReady] = useState(false);
  const [rewardedLoaded, setRewardedLoaded] = useState(false);

  const [coins, setCoins] = useState(0);
  const [opens, setOpens] = useState(0);
  const [rewardUsed, setRewardUsed] = useState(0);
  const [logText, setLogText] = useState('');
  const logRef = useRef([]);

  const addLog = (msg) => {
    const d = new Date();
    const t = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    logRef.current = [...logRef.current, t + ' ' + msg].slice(-9);
    setLogText(logRef.current.join('\n'));
    saveValue('dbg', JSON.stringify(logRef.current));
  };

  const coinsRef = useRef(0);
  const opensRef = useRef(0);
  const rewardUsedRef = useRef(0);

  const pendingLaunchRef = useRef(null); // యాడ్ అయ్యాక తెరవాల్సిన UPI యాప్
  const doLaunchRef = useRef(null);

  const interstitialRef = useRef(null);
  const interstitialLoadedRef = useRef(false);
  const rewardedRef = useRef(null);

  // ---------- సేవ్ చేసిన డేటా లోడ్ ----------
  useEffect(() => {
    (async () => {
      try {
        const c = parseInt((await AsyncStorage.getItem('coins')) || '0', 10) || 0;
        const o = parseInt((await AsyncStorage.getItem('opens')) || '0', 10) || 0;
        const d = await AsyncStorage.getItem('rewardDate');
        let r = parseInt((await AsyncStorage.getItem('rewardUsed')) || '0', 10) || 0;
        if (d !== todayStr()) {
          r = 0;
        }
        try {
          const old = JSON.parse((await AsyncStorage.getItem('dbg')) || '[]');
          if (Array.isArray(old)) logRef.current = old.slice(-7);
        } catch (e2) {
          // ignore
        }
        addLog('APP START saved opens=' + o);
        coinsRef.current = c;
        opensRef.current = o;
        rewardUsedRef.current = r;
        setCoins(c);
        setOpens(o);
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
    const launchPending = () => {
      const p = pendingLaunchRef.current;
      if (p) {
        pendingLaunchRef.current = null;
        if (doLaunchRef.current) doLaunchRef.current(p);
      }
    };
    const u2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoadedRef.current = false;
      ad.load();
      launchPending();
    });
    const u3 = ad.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoadedRef.current = false;
      launchPending();
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

  // యాప్ స్థితి మారినప్పుడు: లాగ్ + సేవ్ చేసిన లెక్క మళ్లీ చదవడం + రోజు మారితే రివార్డ్ లెక్క 0
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      addLog('state=' + state);
      if (state !== 'active') return;
      try {
        const o = parseInt((await AsyncStorage.getItem('opens')) || '0', 10) || 0;
        if (o !== opensRef.current) {
          addLog('reload opens ' + opensRef.current + '->' + o);
          opensRef.current = o;
          setOpens(o);
        }
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

  // ---------- UPI యాప్ నిజంగా తెరవడం ----------
  const doLaunch = async (app) => {
    try {
      addLog('launching ' + app.name);
      await IntentLauncher.openApplication(app.pkg);
      addLog('launch call finished OK');
    } catch (e) {
      addLog('launch ERROR ' + String(e && e.message ? e.message : e).slice(0, 60));
      Alert.alert(app.name + ' తెరవడం కుదరలేదు', 'ఈ యాప్ మీ ఫోన్‌లో ఉందో లేదో చూడండి.', [
        { text: 'రద్దు', style: 'cancel' },
        {
          text: 'Play Store',
          onPress: () => {
            Linking.openURL('market://details?id=' + app.pkg).catch(() => {});
          },
        },
      ]);
    }
  };
  doLaunchRef.current = doLaunch;

  // ---------- బటన్ నొక్కినప్పుడు: లెక్క + (ప్రతి 2వ సారి యాడ్) + UPI యాప్ ----------
  const openUpiApp = async (app) => {
    const n = opensRef.current + 1;
    opensRef.current = n;
    setOpens(n);
    try {
      await AsyncStorage.setItem('opens', String(n));
      addLog('pressed ' + app.name + ' opens=' + n + ' saved');
    } catch (e) {
      addLog('pressed, SAVE FAILED');
    }

    if (n % INTERSTITIAL_EVERY === 0 && interstitialLoadedRef.current && interstitialRef.current) {
      pendingLaunchRef.current = app;
      try {
        interstitialRef.current.show();
        return;
      } catch (e) {
        pendingLaunchRef.current = null;
      }
    }
    doLaunch(app);
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

  const rewardLeft = Math.max(0, DAILY_REWARD_LIMIT - rewardUsed);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>QR పే హెల్పర్</Text>
      <Text style={styles.subtitle}>
        PhonePe లేదా GPay తెరిచి, అందులో QR స్కాన్ చేసి పేమెంట్ చేయండి
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{opens}</Text>
          <Text style={styles.statLabel}>తెరిచినవి</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{coins}</Text>
          <Text style={styles.statLabel}>కాయిన్స్</Text>
        </View>
      </View>

      {UPI_APPS.map((app) => (
        <TouchableOpacity
          key={app.key}
          style={[styles.appBtn, { backgroundColor: app.color }]}
          onPress={() => openUpiApp(app)}
        >
          <Text style={styles.appBtnText}>{app.name} తెరవండి</Text>
        </TouchableOpacity>
      ))}

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

      <Text style={styles.logText}>{logText}</Text>
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
  appBtn: {
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
  },
  appBtnText: {
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
  logText: {
    fontSize: 10,
    color: '#8A90A6',
    marginBottom: 6,
  },
  versionText: {
    fontSize: 11,
    color: '#8A90A6',
    textAlign: 'center',
    marginBottom: 4,
  },
  bannerWrap: {
    alignItems: 'center',
    marginHorizontal: -20,
    backgroundColor: '#FFFFFF',
  },
});
