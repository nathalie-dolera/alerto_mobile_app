import { DestinationCard } from '@/components/alerts/destination-card';
import { ProgressBar } from '@/components/alerts/progress-bar';
import { StatusCard } from '@/components/alerts/status-card';
import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useMapContext } from '@/context/map-context';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createRiskHeatmapShape, riskHeatmapLayerStyle } from '../../utils/heatmap';
import { Platform } from 'react-native';

const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api`;

MapLibreGL.setAccessToken(null);

export default function AlertsScreen() {
  const router = useRouter();
  const { isAlarmActive, activeAlarmDestination, stopAlarm, locationName, region, riskHeatmapPoints } = useMapContext();
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const riskHeatmapShape = createRiskHeatmapShape(riskHeatmapPoints);

  const displayDestination = isAlarmActive 
      ? (activeAlarmDestination || locationName || 'Unknown Destination')
      : '';

  const destinationData = {
    eta: "5 mins"
  };
  const distanceData = {
    remaining: "1.2",
    unit: "km",
    triggerZone: "km",
    triggerDistance: "0.7 km",
    progress: 0.71,
    triggerRatio: 0.75
  };
  const statusData = {
    gps: "Active",
    wearable: "Connected"
  };

  const handleStopAlarm = () => {
    setIsModalVisible(true);
  };

  const handleConfirmStop = () => {
    stopAlarm();
    setIsModalVisible(false);
  };

  const handleCancelStop = () => {
    setIsModalVisible(false);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.mainText }]}>
          Commute Monitor
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.statusSection, { backgroundColor: colors.configColor, borderColor: colors.hr }]}>
          <StatusCard>
            <View style={styles.cardLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon }]}>
                <IconSymbol name="satellite-variant" size={20} color={colors.background} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.mainText }]}>
                GPS
              </Text>
            </View>
            <Text style={[styles.statusValue, { color: colors.lightning }]}>
              {statusData.gps}
            </Text>
          </StatusCard>

          <View style={[styles.divider, { backgroundColor: colors.hr }]} />

          <StatusCard>
            <View style={styles.cardLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon }]}>
                <IconSymbol name="watch" size={20} color={colors.background} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.mainText }]}>
                Wearable
              </Text>
            </View>
            <Text style={[styles.statusValue, { color: colors.primaryIcon }]}>
              {statusData.wearable}
            </Text>
          </StatusCard>
        </View>

        <View style={[styles.mapContainer, { backgroundColor: colors.avatarBorder }]}>
          <MapLibreGL.MapView 
            style={StyleSheet.absoluteFillObject}
            mapStyle={`https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${process.env.EXPO_PUBLIC_STADIA_API_KEY}`}
            logoEnabled={false}
            scrollEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            zoomEnabled={false}
          >
            <MapLibreGL.Camera
              zoomLevel={15}
              centerCoordinate={region}
              animationMode="flyTo"
            />
            
            {riskHeatmapPoints.length > 0 && (
              <MapLibreGL.ShapeSource 
                  id="alertsRiskHeatmapSource" 
                  shape={riskHeatmapShape}
              >
                  <MapLibreGL.HeatmapLayer
                      id="alertsRiskHeatmap"
                      sourceID="alertsRiskHeatmapSource"
                      style={riskHeatmapLayerStyle}
                  />
              </MapLibreGL.ShapeSource>
            )}

            {isAlarmActive && (
              <MapLibreGL.PointAnnotation 
                id="alert-marker" 
                coordinate={region} 
                anchor={{ x: 0.5, y: 1 }}
              >
                <IconSymbol name="location-sharp" size={40} color={colors.locationMarker} />
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>

          {riskHeatmapPoints.length > 0 && (
            <View style={[styles.mapLegend, { backgroundColor: colors.background }]}>
              <Text style={[styles.mapLegendTitle, { color: colors.text }]}>Risk Heatmap</Text>
              <Text style={[styles.mapLegendBody, { color: colors.subtitle }]}>
                Stronger color means more repeated alerts and incident reports.
              </Text>
            </View>
          )}
          
          <DestinationCard>
            <View style={styles.destRow}>
               <Text style={[styles.destLabel, { color: colors.subtitle }]}>DESTINATION</Text>
               <Text style={[styles.destLabel, { color: colors.subtitle }]}>ETA</Text>
            </View>
            <View style={styles.destRowBottom}>
               {isAlarmActive ? (
                 <Text style={[styles.destValue, { color: colors.primaryIcon }]} numberOfLines={1}>{displayDestination}</Text>
               ) : (
                  <Text style={[styles.destInput, { color: colors.subtitle }]}>
                    Input place name
                  </Text>
               )}
               <Text style={[styles.etaValue, { color: colors.lightning }]}>{isAlarmActive ? destinationData.eta : '--'}</Text>
            </View>
          </DestinationCard>
        </View>

        <View style={styles.distanceSection}>
            <Text style={[styles.distanceLabel, { color: colors.mainText }]}>
              DISTANCE REMAINING
            </Text>
           <View style={styles.distanceRow}>
             <Text style={[styles.distanceBig, { color: colors.avatarBg }]}>{isAlarmActive ? distanceData.remaining : '--'}</Text>
              <Text style={[styles.distanceUnit, { color: colors.avatarBg }]}>
                {distanceData.unit}
              </Text>
           </View>

           <View style={styles.progressWrapper}>
             <View style={styles.progressLabels}>
                <Text style={[styles.progressLabelLeft, { color: colors.primaryIcon }]}>
                  Current
                </Text>
                <Text style={[styles.progressLabelRight, { color: colors.lightning }]}>
                  Trigger Zone ({distanceData.triggerZone})
                </Text>
             </View>
             
             <ProgressBar progress={isAlarmActive ? distanceData.progress : 0} triggerRatio={distanceData.triggerRatio} />
             
             <Text style={[styles.progressSubText, { color: colors.mainText }]}>
                Vibration alarm arms in {isAlarmActive ? distanceData.triggerDistance : '--'}
              </Text>
           </View>
        </View>

        {isAlarmActive ? (
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.locationMarker }]} 
            onPress={handleStopAlarm} 
            activeOpacity={0.8}
          >
            <IconSymbol name="check-circle" size={24} color={colors.activeText} style={{ marginRight: 8 }} />
            <Text style={[styles.actionButtonText, { color: colors.activeText }]}>
              Stop Alarm
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.actionButton, { backgroundColor: colors.hr, shadowOpacity: 0, elevation: 0 }]}>
            <Text style={[styles.actionButtonText, { color: colors.subtitle }]}>
              No Active Alarm
            </Text>
          </View>
        )}
      </ScrollView>

      <StopAlarmModal visible={isModalVisible}>
        <View style={[styles.modalIconBox, { backgroundColor: colors.background }]}>
          <IconSymbol name="alert-outline" size={40} color={colors.locationMarker} />
        </View>
        <Text style={[styles.modalTitle, { color: colors.text }]}>
          Stop Alarm?
        </Text>
        <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
          Are you sure you want to stop the alarm? Make sure you are fully awake.
        </Text>
        
        <TouchableOpacity 
          style={[styles.primaryModalButton, { backgroundColor: colors.locationMarker }]} 
          onPress={handleConfirmStop} 
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryModalButtonText, { color: colors.activeText }]}>
            Yes, Stop Alarm
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.secondaryModalButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={handleCancelStop} 
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryModalButtonText, { color: colors.activeText }]}>
            No, Keep Monitoring
          </Text>
        </TouchableOpacity>
      </StopAlarmModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    safeArea: { 
      flex: 1, 
    },
    header: {
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center',
      paddingHorizontal: 20, 
      paddingTop: 30, 
      paddingBottom: 20,
    },
    headerTitle: { 
      fontSize: 20, 
      fontWeight: '700', 
    },
    scrollContent: { 
      paddingHorizontal: 20, 
      paddingBottom: 40 
    },
    statusSection: {
      borderRadius: 16, 
      paddingHorizontal: 16, 
      paddingVertical: 8,
      borderWidth: 1, 
      marginBottom: 24,
    },
    divider: { 
      height: 1, 
      marginVertical: 4 
    },
    cardLeft: { 
      flexDirection: 'row', 
      alignItems: 'center' 
    },
    iconBox: { 
      borderRadius: 8, 
      padding: 8, 
      marginRight: 12 
    },
    statusTitle: { 
      fontSize: 16, 
      fontWeight: '500' 
    },
    statusValue: { 
      fontSize: 14, 
      fontWeight: '600' 
    },
    mapContainer: {
      height: 250, 
      borderRadius: 16, 
      overflow: 'hidden', 
      marginBottom: 24,
      position: 'relative', 
    },
    mapLegend: {
      position: 'absolute',
      top: 12,
      left: 12,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      maxWidth: 180,
    },
    mapLegendTitle: {
      fontSize: 12,
      fontWeight: '700',
    },
    mapLegendBody: {
      fontSize: 11,
      marginTop: 2,
      lineHeight: 15,
    },
    destRow: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'flex-end', 
      marginBottom: 4 
    },
    destRowBottom: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      gap: 10 
    },
    destLabel: { 
      fontSize: 12, 
      letterSpacing: 0.5, 
      fontWeight: '500' 
    },
    destValue: { 
      fontSize: 18, 
      fontWeight: '600', 
      flex: 1 
    },
    destInput: { 
      fontSize: 18, 
      fontWeight: '600', 
      padding: 0, 
      flex: 1 
    },
    etaValue: { 
      fontSize: 20, 
      fontWeight: '700' 
    },
    distanceSection: { 
      alignItems: 'center', 
      marginVertical: 10 
    },
    distanceLabel: { 
      fontSize: 14, 
      letterSpacing: 0.5, 
      fontWeight: '500' 
    },
    distanceRow: { 
      flexDirection: 'row', 
      alignItems: 'baseline',
      marginTop: 8 
    },
    distanceBig: { 
      fontSize: 64, 
      fontWeight: '700', 
      lineHeight: 70 
    },
    distanceUnit: { 
      fontSize: 24, 
      fontWeight: '600', 
      marginLeft: 8 
    },
    progressWrapper: { 
      width: '100%', 
      paddingHorizontal: 20, 
      marginTop: 10 
    },
    progressLabels: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      marginBottom: 8 
    },
    progressLabelLeft: { 
      fontSize: 12, 
      fontWeight: '600' 
    },
    progressLabelRight: { 
      fontSize: 12, 
      fontWeight: '600' 
    },
    progressSubText: { 
      textAlign: 'center', 
      marginTop: 12, 
      fontSize: 13, 
      fontWeight: '500' 
    },
    actionButton: {
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center',
      paddingVertical: 18, 
      borderRadius: 16, 
      marginTop: 20,
      shadowOpacity: 0.3, 
      shadowRadius: 10, 
      shadowOffset: { width: 0, height: 4 }, 
      elevation: 5,
    },
    actionButtonText: { 
      fontSize: 18, 
      fontWeight: '700' 
    },
    modalIconBox: {
      width: 64, 
      height: 64, 
      borderRadius: 32,
      justifyContent: 'center', 
      alignItems: 'center', 
      marginBottom: 20,
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
      marginBottom: 32 
    },
    primaryModalButton: {
      width: '100%', 
      paddingVertical: 16, 
      borderRadius: 8,
      alignItems: 'center', 
      marginBottom: 12,
    },
    primaryModalButtonText: { 
      fontSize: 16, 
      fontWeight: '600' 
    },
    secondaryModalButton: {
      width: '100%', 
      paddingVertical: 16, 
      borderRadius: 8, 
      alignItems: 'center',
    },
    secondaryModalButtonText: { 
      fontSize: 16, 
      fontWeight: '600' 
    },
  });
