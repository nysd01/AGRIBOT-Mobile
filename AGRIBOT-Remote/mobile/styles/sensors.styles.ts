import { StyleSheet } from 'react-native';

export const sensorsStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#070A0A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerSection: {
    marginBottom: 24,
  },
  diagnosticLabel: {
    color: '#7A8582',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 12,
  },
  titleUnderline: {
    width: 40,
    height: 4,
    backgroundColor: '#58C95F',
    borderRadius: 2,
  },
  sensorsGrid: {
    gap: 12,
    marginBottom: 24,
  },
  sensorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151718',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  sensorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0C0E0F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sensorContent: {
    flex: 1,
  },
  sensorName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sensorStatus: {
    color: '#7A8582',
    fontSize: 12,
    fontWeight: '500',
  },
  sensorStatusActive: {
    color: '#58C95F',
  },
  sensorValue: {
    color: '#81F295',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  sensorToggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  toggleOn: {
    backgroundColor: '#58C95F',
  },
  toggleOff: {
    backgroundColor: '#6C7473',
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
  },
  toggleCircleLeft: {
    left: 2,
  },
  toggleCircleRight: {
    right: 2,
  },
  addSensorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#58C95F',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 24,
    gap: 8,
  },
  addSensorText: {
    color: '#070A0A',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statsSection: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#151718',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: {
    color: '#7A8582',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statValue: {
    color: '#58C95F',
    fontSize: 20,
    fontWeight: '700',
  },
});
