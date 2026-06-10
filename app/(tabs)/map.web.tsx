import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MapScreen() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.center}>
        <MaterialCommunityIcons name="map-marker-off-outline" size={48} color="#72F88A" />
        <Text style={styles.title}>GPS MAP</Text>
        <Text style={styles.body}>
          Map view is only available on the mobile app.{'\n'}
          Open this app in Expo Go on your phone to see live GPS tracking.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#070A0A',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  title: {
    color: '#E6F4EA',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  body: {
    color: '#6C7473',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
