import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { Button, Text, View, StyleSheet, Linking } from 'react-native';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) return <View />;
  if (!permission.granted) {
    return <View style={styles.container}><Text>కెమెరా కావాలి</Text><Button title="Allow" onPress={requestPermission} /></View>;
  }

  const onScan = (result) => {
    if(scanned) return;
    setScanned(true);
    Linking.openURL(result.data);
    setTimeout(()=> setScanned(false), 2000);
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" onBarcodeScanned={onScan} barcodeScannerSettings={{barcodeTypes:["qr"]}} />
    </View>
  );
}
const styles = StyleSheet.create({
  container:{flex:1},
  camera:{flex:1}
});
