import React, { useState, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import { remoteStyles } from '@/styles/remote.styles';

const logEntries = [
  {
    id: 1,
    type: 'warning',
    title: 'Low moisture detected',
    subtitle: 'Zone C-1 + Deploying micro-irrigation',
    time: '14:32',
  },
  {
    id: 2,
    type: 'pest',
    title: 'Pest identified at Zone B',
    subtitle: 'Action: Precision biological spray',
    time: '13:58',
  },
  {
    id: 3,
    type: 'check',
    title: 'Scan completed',
    subtitle: 'Sector Alpha successfully mapped',
    time: '13:41',
  },
  {
    id: 4,
    type: 'reroute',
    title: 'Rerouting: Obstacle',
    subtitle: 'Neural path recalculating...',
    time: '13:29',
  },
];

export default function RemoteScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [isAutonomous, setIsAutonomous] = useState(true);
  const [direction, setDirection] = useState<string | null>(null);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0 });
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const joystickRef = useRef(null);
  const cameraRef = useRef(null);

  // Gyroscope listener
  useEffect(() => {
    if (!gyroEnabled || isAutonomous) return;

    // Set accelerometer update interval
    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y }: { x: number; y: number }) => {
      // Map accelerometer values to joystick movement
      // x: tilt left/right, y: tilt forward/backward
      // Normalize and scale values
      const magnitude = Math.sqrt(x * x + y * y);
      
      if (magnitude < 0.2) {
        setDirection(null);
        setStickPosition({ x: 0, y: 0 });
        return;
      }

      // Scale the values to joystick movement (max 60px)
      const maxAccel = 10;
      const scaleFactor = 60 / maxAccel;
      const scaledX = (x / maxAccel) * scaleFactor;
      const scaledY = (-y / maxAccel) * scaleFactor; // Invert Y for natural feel

      // Limit to circular boundary
      const distance = Math.sqrt(scaledX * scaledX + scaledY * scaledY);
      const maxDistance = 60;

      let finalX = scaledX;
      let finalY = scaledY;

      if (distance > maxDistance) {
        const angle = Math.atan2(scaledY, scaledX);
        finalX = Math.cos(angle) * maxDistance;
        finalY = Math.sin(angle) * maxDistance;
      }

      setStickPosition({ x: finalX, y: finalY });

      // Determine direction based on angle
      const angle = Math.atan2(scaledY, scaledX);
      const angleDegrees = (angle * 180) / Math.PI;

      if (distance < 20) {
        setDirection(null);
      } else if (angleDegrees > -45 && angleDegrees <= 45) {
        setDirection('right');
      } else if (angleDegrees > 45 && angleDegrees <= 135) {
        setDirection('down');
      } else if (angleDegrees > 135 || angleDegrees <= -135) {
        setDirection('left');
      } else {
        setDirection('up');
      }
    });

    return () => subscription.remove();
  }, [gyroEnabled, isAutonomous]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Do nothing on initial grant
      },
      onPanResponderMove: (evt, { dx, dy }) => {
        // Limit movement to circular boundary
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 60; // Maximum radius for stick movement

        if (distance > maxDistance) {
          const angle = Math.atan2(dy, dx);
          setStickPosition({
            x: Math.cos(angle) * maxDistance,
            y: Math.sin(angle) * maxDistance,
          });
        } else {
          setStickPosition({ x: dx, y: dy });
        }

        // Determine direction based on angle
        const angle = Math.atan2(dy, dx);
        const angleDegrees = (angle * 180) / Math.PI;

        // North: -45 to 45 degrees
        // East: 45 to 135 degrees
        // South: 135 to -135 degrees
        // West: -135 to -45 degrees

        if (distance < 20) {
          setDirection(null);
        } else if (angleDegrees > -45 && angleDegrees <= 45) {
          setDirection('right');
        } else if (angleDegrees > 45 && angleDegrees <= 135) {
          setDirection('down');
        } else if (angleDegrees > 135 || angleDegrees <= -135) {
          setDirection('left');
        } else {
          setDirection('up');
        }
      },
      onPanResponderRelease: () => {
        // Reset stick to center
        setStickPosition({ x: 0, y: 0 });
        setDirection(null);
      },
    })
  ).current;

  const cameraResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, { dx, dy }) => {
        // Camera pan with limited range
        const maxPan = 40; // Maximum pan offset
        const constrainedX = Math.max(-maxPan, Math.min(maxPan, dx / 3));
        const constrainedY = Math.max(-maxPan, Math.min(maxPan, dy / 3));
        setCameraPosition({ x: constrainedX, y: constrainedY });
      },
      onPanResponderRelease: () => {
        // Reset camera to center
        setCameraPosition({ x: 0, y: 0 });
      },
    })
  ).current;

  const getLogIconColor = (type: string) => {
    switch (type) {
      case 'warning':
        return '#F4A460';
      case 'pest':
        return '#E74C3C';
      case 'check':
        return '#58C95F';
      case 'reroute':
        return '#3498DB';
      default:
        return '#7A8582';
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return 'alert-circle';
      case 'pest':
        return 'bug';
      case 'check':
        return 'check-circle';
      case 'reroute':
        return 'triangle-outline';
      default:
        return 'circle';
    }
  };

  return (
    <SafeAreaView style={remoteStyles.safe}>
      <ScrollView
        style={remoteStyles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={remoteStyles.headerSection}>
          <Text style={remoteStyles.statusLabel}>SYSTEM STATUS: ACTIVE</Text>
          <Text style={remoteStyles.mainTitle}>
            {isAutonomous ? 'Autonomous' : 'Manual'}{'\n'}
            {isAutonomous ? 'Command' : 'Control'}
          </Text>

          {/* Toggle Buttons */}
          <View style={remoteStyles.toggleContainer}>
            <Pressable
              style={[
                remoteStyles.toggleButton,
                isAutonomous && remoteStyles.toggleActive,
                !isAutonomous && remoteStyles.toggleInactive,
              ]}
              onPress={() => setIsAutonomous(true)}
            >
              <Text
                style={[
                  remoteStyles.toggleText,
                  isAutonomous
                    ? remoteStyles.toggleTextActive
                    : remoteStyles.toggleTextInactive,
                ]}
              >
                ON
              </Text>
            </Pressable>
            <Pressable
              style={[
                remoteStyles.toggleButton,
                !isAutonomous && remoteStyles.toggleActive,
                isAutonomous && remoteStyles.toggleInactive,
              ]}
              onPress={() => setIsAutonomous(false)}
            >
              <Text
                style={[
                  remoteStyles.toggleText,
                  !isAutonomous
                    ? remoteStyles.toggleTextActive
                    : remoteStyles.toggleTextInactive,
                ]}
              >
                OFF
              </Text>
            </Pressable>
          </View>

          {/* Live Operation/Telemetry Badge */}
          <View
            style={[
              remoteStyles.liveOperationBadge,
              !isAutonomous && remoteStyles.liveTelemetryBadge,
            ]}
          >
            <View
              style={[
                remoteStyles.liveOperationDot,
                !isAutonomous && remoteStyles.liveTelemetryDot,
              ]}
            />
            <Text style={remoteStyles.liveOperationText}>
              {isAutonomous ? 'LIVE OPERATION' : 'LIVE TELEMETRY'}
            </Text>
          </View>
        </View>

        {isAutonomous ? (
          <>
            {/* AUTONOMOUS MODE */}
            {/* Current Action Section */}
            <View style={remoteStyles.currentActionSection}>
              <Text style={remoteStyles.currentActionLabel}>Current Action</Text>
              <Text style={remoteStyles.currentActionText}>Scanning soil...</Text>

              {/* Telemetry Cards Grid */}
              <View style={remoteStyles.telemetryGrid}>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>MOISTURE</Text>
                  <Text style={remoteStyles.telemetryValue}>42.8%</Text>
                </View>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>PH LEVEL</Text>
                  <Text style={remoteStyles.telemetryValue}>6.4</Text>
                </View>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>NITROGEN</Text>
                  <Text style={remoteStyles.telemetryValue}>Optimum</Text>
                </View>
                <View style={remoteStyles.telemetryCard}>
                  <Text style={remoteStyles.telemetryLabel}>YIELD EST.</Text>
                  <Text style={remoteStyles.telemetryValue}>12.4t</Text>
                </View>
              </View>
            </View>

            {/* Neural Engine Log */}
            <View style={remoteStyles.neuralEngineSection}>
              <View style={remoteStyles.sectionHeader}>
                <Text style={remoteStyles.sectionTitle}>Neural Engine Log</Text>
                <View style={remoteStyles.infoIcon}>
                  <Text style={remoteStyles.infoIconText}>i</Text>
                </View>
              </View>

              <View style={remoteStyles.logEntryList}>
                {logEntries.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[
                      remoteStyles.logEntry,
                      index === logEntries.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View
                      style={[
                        remoteStyles.logEntryIcon,
                        {
                          backgroundColor: getLogIconColor(entry.type) + '20',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={getLogIcon(entry.type)}
                        size={12}
                        color={getLogIconColor(entry.type)}
                      />
                    </View>
                    <View style={remoteStyles.logEntryContent}>
                      <Text style={remoteStyles.logEntryTitle}>
                        {entry.title}
                      </Text>
                      <Text style={remoteStyles.logEntrySubtitle}>
                        {entry.subtitle}
                      </Text>
                      <Text style={remoteStyles.logEntryTime}>{entry.time}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={remoteStyles.exportButton}>EXPORT TELEMETRY</Text>
            </View>

            {/* Path Trajectory */}
            <View style={remoteStyles.pathTrajectorySection}>
              <Text style={remoteStyles.sectionTitle}>Path Trajectory</Text>
              <Text
                style={[
                  remoteStyles.currentActionLabel,
                  { marginTop: 8, marginBottom: 12 },
                ]}
              >
                SECTOR ALPHA-9 + GRID 14-88
              </Text>

              {/* Chart Placeholder */}
              <View style={remoteStyles.chartContainer}>
                <Text style={remoteStyles.chartPlaceholder}>
                  [Path trajectory chart visualized here]
                </Text>
              </View>

              {/* Legend */}
              <View style={remoteStyles.chartLegend}>
                <View style={remoteStyles.legendItem}>
                  <View
                    style={[remoteStyles.legendDot, { backgroundColor: '#58C95F' }]}
                  />
                  <Text style={remoteStyles.legendText}>COMPLETED</Text>
                </View>
                <View style={remoteStyles.legendItem}>
                  <View
                    style={[
                      remoteStyles.legendDot,
                      { backgroundColor: '#6C7473', borderWidth: 1, borderColor: '#6C7473' },
                    ]}
                  />
                  <Text style={remoteStyles.legendText}>PREDICTED</Text>
                </View>
                <View style={remoteStyles.legendItem}>
                  <View
                    style={[remoteStyles.legendDot, { backgroundColor: '#F4A460' }]}
                  />
                  <Text style={remoteStyles.legendText}>ANOMALIES</Text>
                </View>
              </View>
            </View>

            {/* Energy Efficiency */}
            <View style={remoteStyles.energySection}>
              <View style={remoteStyles.energyIcon}>
                <MaterialCommunityIcons
                  name="battery-high"
                  size={40}
                  color="#58C95F"
                />
              </View>
              <Text style={remoteStyles.energyTitle}>Energy Efficiency</Text>
              <Text style={remoteStyles.energyDescription}>
                Running at 94% optimal power efficiency.{'\n'}Battery life estimated
                for 14.5 more hours{'\n'}of operations.
              </Text>

              {/* Energy Bar */}
              <View style={remoteStyles.energyBar}>
                <View style={remoteStyles.energyBarFill} />
              </View>

              <Text style={remoteStyles.viewGridButton}>VIEW POWER GRID</Text>
            </View>
          </>
        ) : (
          <>
            {/* MANUAL CONTROL MODE - LANDSCAPE */}
            {isLandscape ? (
              <View style={remoteStyles.landscapeManualContainer}>
                {/* Full Screen Camera Background with Pan & Scroll */}
                <ScrollView
                  ref={cameraRef}
                  style={remoteStyles.landscapeVideoBackground}
                  scrollEventThrottle={16}
                  onScroll={({ nativeEvent }) => {
                    // Map scroll gestures to camera movement
                    const scrollY = nativeEvent.contentOffset.y;
                    const scrollX = nativeEvent.contentOffset.x;
                    const maxScroll = 80;
                    
                    // Normalize scroll to camera movement range
                    const cameraPan = {
                      x: Math.max(-40, Math.min(40, (scrollX / maxScroll) * 40)),
                      y: Math.max(-40, Math.min(40, (scrollY / maxScroll) * 40)),
                    };
                    setCameraPosition(cameraPan);
                  }}
                  scrollEnabled={true}
                  showsVerticalScrollIndicator={false}
                  showsHorizontalScrollIndicator={false}
                >
                  <View style={remoteStyles.landscapeScrollableContent}>
                    {/* Camera pan effect with slight transform */}
                    <View
                      style={[
                        remoteStyles.landscapeVideoContent,
                        {
                          transform: [
                            { translateX: cameraPosition.x },
                            { translateY: cameraPosition.y },
                          ],
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="robot-industrial"
                        size={200}
                        color="#58C95F"
                        style={{ opacity: 0.6 }}
                      />
                      <Text style={remoteStyles.landscapeVideoLabel}>
                        Lactuca sativa: 94.2%
                      </Text>
                    </View>

                    {/* Camera Hint */}
                    <Text style={remoteStyles.cameraHintText}>Scroll to move camera</Text>
                  </View>
                </ScrollView>

                {/* Joystick Overlay - Bottom Left */}
                <View style={remoteStyles.landscapeJoystickContainer}>
                  <View
                    ref={joystickRef}
                    style={remoteStyles.landscapeJoystickRing}
                    {...panResponder.panHandlers}
                  >
                    {/* Directional Indicators */}
                    <Text
                      style={[
                        remoteStyles.joystickRingLabel,
                        remoteStyles.joystickRingLabelTop,
                        direction === 'up' && remoteStyles.joystickRingLabelActive,
                      ]}
                    >
                      ▲
                    </Text>
                    <Text
                      style={[
                        remoteStyles.joystickRingLabel,
                        remoteStyles.joystickRingLabelBottom,
                        direction === 'down' && remoteStyles.joystickRingLabelActive,
                      ]}
                    >
                      ▼
                    </Text>
                    <Text
                      style={[
                        remoteStyles.joystickRingLabel,
                        remoteStyles.joystickRingLabelLeft,
                        direction === 'left' && remoteStyles.joystickRingLabelActive,
                      ]}
                    >
                      ◄
                    </Text>
                    <Text
                      style={[
                        remoteStyles.joystickRingLabel,
                        remoteStyles.joystickRingLabelRight,
                        direction === 'right' && remoteStyles.joystickRingLabelActive,
                      ]}
                    >
                      ►
                    </Text>

                    {/* Movable Center Stick */}
                    <View
                      style={[
                        remoteStyles.landscapeJoystickStick,
                        {
                          transform: [
                            { translateX: stickPosition.x },
                            { translateY: stickPosition.y },
                          ],
                        },
                      ]}
                    >
                      <View style={remoteStyles.joystickStickInner}>
                        <MaterialCommunityIcons
                          name={
                            direction === 'up'
                              ? 'chevron-up'
                              : direction === 'down'
                              ? 'chevron-down'
                              : direction === 'left'
                              ? 'chevron-left'
                              : direction === 'right'
                              ? 'chevron-right'
                              : 'circle'
                          }
                          size={24}
                          color="#070A0A"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Direction Indicator Text */}
                  <Text style={remoteStyles.landscapeDirectionLabel}>
                    {direction === 'up'
                      ? 'FORWARD'
                      : direction === 'down'
                      ? 'BACKWARD'
                      : direction === 'left'
                      ? 'LEFT'
                      : direction === 'right'
                      ? 'RIGHT'
                      : 'READY'}
                  </Text>
                </View>

                {/* Telemetry in Top Right */}
                <View style={remoteStyles.landscapeTelemetryBox}>
                  <View style={remoteStyles.landscapeTelemetryItem}>
                    <Text style={remoteStyles.landscapeTelemetryLabel}>AZIMUTH</Text>
                    <Text style={[remoteStyles.landscapeTelemetryValue, { color: '#4A9AFF' }]}>
                      284.5°
                    </Text>
                  </View>
                  <View style={remoteStyles.landscapeTelemetryItem}>
                    <Text style={remoteStyles.landscapeTelemetryLabel}>pH</Text>
                    <Text style={[remoteStyles.landscapeTelemetryValue, { color: '#58C95F' }]}>
                      6.8
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <>
                {/* MANUAL CONTROL MODE - PORTRAIT */}
                {/* Robot Live Feed */}
            <View style={remoteStyles.liveVideoContainer}>
              <View style={remoteStyles.liveVideoBox}>
                <MaterialCommunityIcons
                  name="robot-industrial"
                  size={120}
                  color="#58C95F"
                  style={{ opacity: 0.5 }}
                />
                <Text style={remoteStyles.liveVideoLabel}>Lactuca sativa: 94.2%</Text>
              </View>
            </View>

            {/* Gyro Control Button */}
            <View style={remoteStyles.gyroControlSection}>
              <Pressable
                style={[
                  remoteStyles.gyroButton,
                  gyroEnabled && remoteStyles.gyroButtonActive,
                  !gyroEnabled && remoteStyles.gyroButtonInactive,
                ]}
                onPress={() => setGyroEnabled(!gyroEnabled)}
              >
                <MaterialCommunityIcons
                  name={gyroEnabled ? 'motion-sensor' : 'motion'}
                  size={20}
                  color={gyroEnabled ? '#070A0A' : '#58C95F'}
                />
                <Text
                  style={[
                    remoteStyles.gyroButtonText,
                    gyroEnabled && remoteStyles.gyroButtonTextActive,
                  ]}
                >
                  {gyroEnabled ? 'Gyro ON' : 'Gyro OFF'}
                </Text>
              </Pressable>
              {gyroEnabled && (
                <Text style={remoteStyles.gyroStatusText}>
                  Tilt phone to control
                </Text>
              )}
            </View>

            {/* Telemetry Cards Grid - 2x2 */}
            <View style={remoteStyles.manualTelemetryGrid}>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>AZIMUTH</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#4A9AFF' }]}>
                  284.5°
                </Text>
              </View>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>SOIL PH</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#58C95F' }]}>
                  6.8
                </Text>
              </View>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>MOISTURE</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#58C95F' }]}>
                  42%
                </Text>
              </View>
              <View style={remoteStyles.manualTelemetryCard}>
                <Text style={remoteStyles.manualTelemetryLabel}>TORQUE</Text>
                <Text style={[remoteStyles.manualTelemetryValue, { color: '#4A9AFF' }]}>
                  48 Nm
                </Text>
              </View>
            </View>

            {/* Joystick Control */}
            <View style={remoteStyles.joystickSection}>
              {/* Direction Indicator */}
              <Text style={remoteStyles.joystickDirectionLabel}>
                {direction === 'up'
                  ? 'FORWARD'
                  : direction === 'down'
                  ? 'BACKWARD'
                  : direction === 'left'
                  ? 'LEFT'
                  : direction === 'right'
                  ? 'RIGHT'
                  : 'FORWARD'}
              </Text>

              {/* Circular Joystick - Touch Interactive */}
              <View
                ref={joystickRef}
                style={remoteStyles.joystickRing}
                {...panResponder.panHandlers}
              >
                {/* Directional Indicators Around Ring */}
                <Text
                  style={[
                    remoteStyles.joystickRingLabel,
                    remoteStyles.joystickRingLabelTop,
                    direction === 'up' && remoteStyles.joystickRingLabelActive,
                  ]}
                >
                  ▲
                </Text>
                <Text
                  style={[
                    remoteStyles.joystickRingLabel,
                    remoteStyles.joystickRingLabelBottom,
                    direction === 'down' && remoteStyles.joystickRingLabelActive,
                  ]}
                >
                  ▼
                </Text>
                <Text
                  style={[
                    remoteStyles.joystickRingLabel,
                    remoteStyles.joystickRingLabelLeft,
                    direction === 'left' && remoteStyles.joystickRingLabelActive,
                  ]}
                >
                  ◄
                </Text>
                <Text
                  style={[
                    remoteStyles.joystickRingLabel,
                    remoteStyles.joystickRingLabelRight,
                    direction === 'right' && remoteStyles.joystickRingLabelActive,
                  ]}
                >
                  ►
                </Text>

                {/* Movable Center Stick */}
                <View
                  style={[
                    remoteStyles.joystickStick,
                    {
                      transform: [
                        { translateX: stickPosition.x },
                        { translateY: stickPosition.y },
                      ],
                    },
                  ]}
                >
                  <View style={remoteStyles.joystickStickInner}>
                    <MaterialCommunityIcons
                      name={
                        direction === 'up'
                          ? 'chevron-up'
                          : direction === 'down'
                          ? 'chevron-down'
                          : direction === 'left'
                          ? 'chevron-left'
                          : direction === 'right'
                          ? 'chevron-right'
                          : 'circle'
                      }
                      size={32}
                      color="#070A0A"
                    />
                  </View>
                </View>
              </View>

              {/* Left/Right Labels */}
              <View style={remoteStyles.joystickLabelsRow}>
                <Text style={remoteStyles.joystickSideLabel}>LEFT</Text>
                <Text style={remoteStyles.joystickSideLabel}>RIGHT</Text>
              </View>
            </View>
              </>
            )}
          </>
        )}

        {/* Bottom Padding */}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
