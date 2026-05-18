import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View, Button, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'react-native-vision-camera';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/color';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { useDriverMonitor } from '@/hooks/use-driver-monitor';
import { MetricsGrid } from '@/components/driver-monitor/metrics-grid';
import { CameraOverlay } from '@/components/driver-monitor/camera-overlay';

export default function DriverMonitorScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const {
    hasPermission,
    requestPermission,
    device,
    cameraRef,
    isAlerting,
    showModal,
    countdown,
    smsSent,
    eyeOpenPercent,
    faceDetected,
    isInfoHidden,
    setIsInfoHidden,
    cameraLayout,
    setCameraLayout,
    detectorStatus,
    handleDismissAlert,
    connectedDevice,
    getStatusText,
    getStatusColor,
    mapCameraFrameToPreview,
    mapCameraPointToPreview,
    detectionOverlay,
  } = useDriverMonitor();

  const faceOverlayStyle = detectionOverlay ? mapCameraFrameToPreview(detectionOverlay.face) : null;
  const leftEyeOverlayStyle = detectionOverlay ? mapCameraFrameToPreview(detectionOverlay.leftEye) : null;
  const rightEyeOverlayStyle = detectionOverlay ? mapCameraFrameToPreview(detectionOverlay.rightEye) : null;
  const eyePoints = detectionOverlay
    ? [...detectionOverlay.leftEyePoints, ...detectionOverlay.rightEyePoints]
    : [];
  const isLandscape = cameraLayout.width > cameraLayout.height;
  const wearableConnected = Boolean(connectedDevice);
  const wearableName = connectedDevice?.name ?? 'Wearable';

  if (!hasPermission) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={{ color: colors.mainText, marginBottom: 20, textAlign: 'center', fontSize: 16 }}>
          We need camera permission for driver monitoring.
        </Text>
        <Button onPress={requestPermission} title="Grant Permission" color={colors.locationMarker} />
      </SafeAreaView>
    );
  }

  if (device == null) {
    return <View style={styles.container}><Text style={{color:'#fff', textAlign:'center', marginTop: 100}}>No front camera found.</Text></View>;
  }

  return (
    <View
      style={styles.container}
      onLayout={({ nativeEvent }) => setCameraLayout(nativeEvent.layout)}
    >
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={true}
        photo={true}
        video={Platform.OS === 'ios'}
        androidPreviewViewType="texture-view"
        outputOrientation="preview"
        resizeMode="cover"
      />

      <CameraOverlay 
        faceOverlayStyle={faceOverlayStyle}
        leftEyeOverlayStyle={leftEyeOverlayStyle}
        rightEyeOverlayStyle={rightEyeOverlayStyle}
        eyePoints={eyePoints}
        mapCameraPointToPreview={mapCameraPointToPreview}
        statusColor={getStatusColor()}
        isLandscape={isLandscape}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {isInfoHidden ? (
          <TouchableOpacity
            style={[styles.showInfoButton, isLandscape && styles.showInfoButtonLandscape]}
            onPress={() => setIsInfoHidden(false)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Show eye detector information"
          >
            <IconSymbol name="eye" size={20} color="#fff" />
            <Text style={styles.showInfoText}>Show</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.statusPanel, isLandscape && styles.statusPanelLandscape]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
              <View style={styles.statusTextBox}>
                <Text style={styles.statusTitle}>{getStatusText()}</Text>
                <Text style={styles.statusDetail}>
                  {faceDetected
                    ? `Eye landmarks are being tracked${isLandscape ? ' in landscape' : ''}`
                    : detectorStatus}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.hideInfoButton}
                onPress={() => setIsInfoHidden(true)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Hide eye detector information"
              >
                <IconSymbol name="eye-off" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <MetricsGrid 
              isLandscape={isLandscape}
              eyeOpenPercent={eyeOpenPercent}
              faceDetected={faceDetected}
              wearableConnected={wearableConnected}
              wearableName={wearableName}
            />
          </View>
        )}

        <StopAlarmModal visible={showModal}>
          <View style={[styles.modalIconBox, { backgroundColor: colors.dangerBg }]}>
            <IconSymbol name="alert-circle" size={40} color={colors.locationMarker} />
          </View>
          
          {smsSent ? (
            <>
              <Text style={[styles.modalTitle, { color: colors.locationMarker, textAlign: 'center' }]}>
                SMS Sent!
              </Text>
              <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
                Emergency contact has been notified with your current location.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.modalTitle, { color: colors.text, textAlign: 'center' }]}>
                WAKE UP!
              </Text>
              <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
                Drowsiness detected. Sending emergency SMS in:
              </Text>
              <Text style={[styles.countdownText, { color: colors.locationMarker }]}>
                {countdown}s
              </Text>
            </>
          )}
          
          <TouchableOpacity 
            style={[styles.primaryModalButton, { backgroundColor: smsSent ? colors.buttonBackground : colors.locationMarker }]} 
            onPress={handleDismissAlert} 
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryModalButtonText, { color: smsSent ? colors.mainText : colors.activeText }]}>
              {smsSent ? 'Close' : 'Tap to Cancel & Wake Up'}
            </Text>
          </TouchableOpacity>
        </StopAlarmModal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: { 
    flex: 1, 
  },
  header: {
    paddingHorizontal: 20, 
    paddingTop: 10, 
    zIndex: 20,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    minHeight: 130,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 20,
    elevation: 20,
  },
  statusPanelLandscape: {
    left: '25%',
    right: '25%',
    top: undefined,
    bottom: 16,
    width: undefined,
    minHeight: 110,
    maxHeight: 150,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusTextBox: {
    flex: 1,
  },
  hideInfoButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  showInfoButton: {
    position: 'absolute',
    left: 20,
    bottom: 28,
    minWidth: 92,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 20,
    elevation: 20,
  },
  showInfoButtonLandscape: {
    left: '42%',
    right: '42%',
    bottom: 16,
    minWidth: undefined,
  },
  showInfoText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  statusTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statusDetail: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 13,
    marginTop: 3,
  },
  modalIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalTitle: { 
    fontSize: 22, 
    fontWeight: '700', 
    marginBottom: 12 
  },
  modalMessage: { 
    fontSize: 16, 
    textAlign: 'center', 
    lineHeight: 24, 
    marginBottom: 16 
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 32,
  },
  primaryModalButton: {
    width: '100%', 
    paddingVertical: 16, 
    borderRadius: 8,
    alignItems: 'center', 
  },
  primaryModalButtonText: { 
    fontSize: 16, 
    fontWeight: '600' 
  },
});
