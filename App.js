import { useState, useEffect } from 'react';
import { Text, View, StyleSheet, Linking } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);
  const handleScan = ({ data }) => {
    if(!scanned){
      setScanned(true);
      Linking.openURL(data);
      setTimeout(()=>setScanned(false), 2000);
    }
  };
  if (hasPermission === null) return <View/>;
  if (hasPermission === false) return <Text>Camera permission ivvu anna</Text>;
  return (
    <View style={styles.container}>
      <BarCodeScanner onBarCodeScanned={handleScan} style={StyleSheet.absoluteFillObject} />
    </View>
  );
}
const styles = StyleSheet.create({ container: { flex: 1 } });
