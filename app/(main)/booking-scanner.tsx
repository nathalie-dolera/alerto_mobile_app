import { CustomAlertButton, CustomAlertModal } from '@/components/ui/custom-alert-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { EmergencyService } from '@/services/emergency-service';
import { OcrService, RideDetails } from '@/services/ocr-service';
import { SmsService } from '@/services/sms-service';
import { StorageService } from '@/services/storage-service';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme
} from 'react-native';

export default function BookingScannerScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const { user } = useAuth();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [details, setDetails] = useState<RideDetails | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [activeContacts, setActiveContacts] = useState<any[]>([]);

  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    icon?: string;
    iconColor?: string;
    buttons: CustomAlertButton[];
  }>({ visible: false, title: '', message: '', buttons: [] });

  const showAlert = (title: string, message: string, buttons?: CustomAlertButton[], icon?: string, iconColor?: string) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      buttons: buttons || [{ text: "OK" }],
      icon,
      iconColor,
    });
  };

  const closeAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));


  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isCountingDown && countdownSeconds > 0) {
      timer = setTimeout(() => {
        setCountdownSeconds(prev => prev - 1);
      }, 1000);
    } else if (isCountingDown && countdownSeconds === 0) {
      setIsCountingDown(false);
      if (screenshotUrl) {
        handleSendAlert(screenshotUrl);
      }
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCountingDown, countdownSeconds, screenshotUrl]);

  const handleCancelCountdown = () => {
    setIsCountingDown(false);
    setCountdownSeconds(5);
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      loadActiveContacts();
    }, [])
  );

  const loadActiveContacts = async () => {
    const allContacts = await EmergencyService.getContacts();
    const contacts = allContacts.filter(c => c.isSelected !== false);
    setActiveContacts(contacts);
  };

  const pickImage = async () => {
    if (activeContacts.length === 0) {
      showAlert(
        "No Active Contacts",
        "Please select or add emergency contacts in Settings (Emergency Contacts) first before using Screenshot Scanner.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go to Settings", onPress: () => router.push('/(main)/emergency-contacts') }
        ],
        "person.crop.circle.badge.plus"
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
      handleSync(result.assets[0].uri, result.assets[0].base64 || "");
    }
  };

  const handleSync = async (uri: string, base64: string) => {
    setIsScanning(true);
    setDetails(null);

    //call AI OCR
    const extracted = await OcrService.parseRideScreenshot(base64);

    if (extracted) {
      setDetails(extracted);
    } else {
      showAlert("Sync Error", "AI could not read the screenshot. Please try another one.", undefined, "alert-outline", colors.dangerIcon);
      setImageUri(null);
    }
    setIsScanning(false);
  };

  const handleStartRide = async () => {
    if (!imageUri || !details) return;

    setIsUploading(true);

    //upload to Cloudinary 
    const uploadedUrl = await StorageService.uploadRideScreenshot(imageUri, user?.id || 'guest');

    if (uploadedUrl) {
      setScreenshotUrl(uploadedUrl);

      try {
        //save ride record to MongoDB 
        const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
        const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api/mobile`;

        const response = await fetch(`${API_URL}/trips`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user?.id,
            destinationName: "Synced Ride",
            durationMs: 0,
            alertsTriggeredCount: 0,
            responseTimes: [],
            unsafeZonesEncountered: [],
            driverName: details.driverName,
            plateNumber: details.plateNumber,
            bookingType: details.bookingType,
            screenshotUrl: uploadedUrl,
            date: new Date().toISOString()
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to save trip to database");
        }

        setIsCountingDown(true);
        setCountdownSeconds(5);
        
      } catch {
        showAlert("Database Sync Error", "Image uploaded but failed to sync details with your account.", undefined, "cloud-alert", colors.dangerIcon);
      }
    } else {
      showAlert("Upload Error", "Failed to upload screenshot to Cloudinary.", undefined, "cloud-off-outline", colors.dangerIcon);
    }
    setIsUploading(false);
  };

  const handleSendAlert = async (imgUrl: string) => {
    if (activeContacts.length === 0) {
      showAlert("No Selected Contacts", "You haven't selected any emergency contacts to receive alerts. Please check them in Settings.", undefined, "account-alert", colors.warningIcon);
      return;
    }

    //get current location
    let locationUrl = "";
    try {
      const loc = await Location.getCurrentPositionAsync({});
      locationUrl = `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`;
    } catch {
    }

    const message = SmsService.formatEmergencyMessage({
      bookingType: details?.bookingType || "Ride",
      plateNumber: details?.plateNumber || "N/A",
      driverName: details?.driverName || "N/A",
      screenshotUrl: imgUrl,
      locationUrl: locationUrl
    });

    for (const contact of activeContacts) {
      await SmsService.sendSms(contact.phoneNumber, message);
    }

    showAlert("Alert Sent", "SMS alerts have been sent to your emergency contacts.", [
      { text: "OK", onPress: () => router.back() }
    ], "check-circle", colors.successIcon);
  };

  const renderSyncContent = () => {
    if (isCountingDown) {
      return (
        <View style={[styles.countdownCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <View style={[styles.countdownIconBg, { backgroundColor: colors.dangerIcon + '20' }]}>
            <IconSymbol name="shield-alert" size={50} color={colors.dangerIcon} />
          </View>
          <Text style={[styles.countdownTitle, { color: colors.dangerIcon }]}>
            EMERGENCY ESCALATION
          </Text>
          <Text style={[styles.countdownText, { color: colors.subtitle }]}>
             High-stakes sequence initiated. Auto-notifying trusted contacts in:
          </Text>
          <Text style={[styles.countdownNumber, { color: colors.text }]}>{countdownSeconds}</Text>

          <TouchableOpacity 
            style={[styles.cancelEscalationButton, { borderColor: colors.hr }]}
            onPress={handleCancelCountdown}
          >
            <Text style={[styles.cancelEscalationText, { color: colors.subtitle }]}>
              Cancel Escalation
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (details && !isScanning) {
      return (
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <Text style={[styles.detailsTitle, { color: colors.subtitle }]}>
            EXTRACTED DETAILS
          </Text>

          <View style={styles.detailRow}>
            <IconSymbol name="car.fill" size={20} color={colors.activeCard} />
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.subtitle }]}>
                App
              </Text>
              <Text 
              style={[styles.detailValue, { color: colors.text }]}>{details.bookingType}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="person.fill" size={20} color={colors.activeCard} />
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.subtitle }]}>
                Driver
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {details.driverName}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="barcode" size={20} color={colors.activeCard} />
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.subtitle }]}>
                Plate Number
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {details.plateNumber}
              </Text>
            </View>
          </View>

          <View style={[styles.detailRow, { borderTopWidth: 1, borderColor: colors.hr, paddingTop: 20, marginTop: 10 }]}>
            <IconSymbol name="person.3.fill" size={20} color={colors.activeCard} />
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.subtitle }]}>
                SEND TO
              </Text>
              <Text style={[styles.detailValue, { color: colors.text, fontSize: 16 }]}>
                {activeContacts.map(c => c.firstName).join(', ')}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.confirmButton, { backgroundColor: colors.activeCard }]}
            onPress={handleStartRide}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color={colors.activeText} />
            ) : (
              <>
                <IconSymbol name="checkmark.circle.fill" size={20} color={colors.activeText} />
                <Text style={[styles.confirmButtonText, { color: colors.activeText }]}>
                  Confirm & Start Trip
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={pickImage}
            disabled={isUploading}
          >
            <Text style={[styles.retryButtonText, { color: colors.subtitle }]}>
              Try Different Image
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={closeAlert}
        buttons={alertConfig.buttons}
        icon={alertConfig.icon}
        iconColor={alertConfig.iconColor}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Booking Screenshot Scanner
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {imageUri ? (
          <View style={styles.syncState}>
            <View style={[styles.imageContainer, { backgroundColor: colors.card, borderColor: colors.hr }]}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
              {isScanning && (
                <View style={styles.scanningOverlay}>
                  <ActivityIndicator size="large" color={colors.activeText} />
                  <Text style={[styles.scanningText, { color: colors.activeText }]}>
                    AI is scanning screenshots...
                  </Text>
                </View>
              )}
            </View>

            {renderSyncContent()}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.iconLarge, { backgroundColor: colors.activeCard + '10' }]}>
              <IconSymbol name="sparkles" size={60} color={colors.activeCard} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Scan Your Booking</Text>
            <Text style={[styles.subtitle, { color: colors.subtitle }]}>
              Take a screenshot of your booking (Grab, Joyride, Move It or others), and let Alerto extract the details and automatically send them to your emergency contacts.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.activeCard }]}
              onPress={pickImage}
            >
              <IconSymbol name="photo.fill" size={20} color={colors.activeText} />
              <Text style={[styles.primaryButtonText, { color: colors.activeText }]}>
                Select Screenshot
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 50,
    paddingBottom: 20
  },
  backBtn: { 
    width: 40, 
    height: 40, 
    justifyContent: 'center' 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold' 
  },
  content: { 
    padding: 24, 
    paddingBottom: 60 
  },
  emptyState: { 
    alignItems: 'center', 
    marginTop: 40 
  },
  iconLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    marginBottom: 12 
  },
  subtitle: { 
    fontSize: 16, 
    textAlign: 'center', 
    lineHeight: 24, 
    marginBottom: 40 
  },
  primaryButton: {
    height: 60,
    width: '100%',
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  primaryButtonText: { 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  syncState: { 
    width: '100%' 
  },
  imageContainer: {
    width: '100%',
    height: 240,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1.5,
  },
  previewImage: { 
    width: '100%', 
    height: '100%' 
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningText: { 
    marginTop: 12, 
    fontSize: 16, 
    fontWeight: '600' 
  },
  detailsCard: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
  },
  detailsTitle: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    marginBottom: 20, 
    letterSpacing: 1 
  },
  detailRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  detailText: { 
    marginLeft: 16, 
    flex: 1 
  },
  detailLabel: { 
    fontSize: 12, 
    fontWeight: '600' 
  },
  detailValue: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginTop: 2 
  },
  confirmButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  confirmButtonText: { 
    fontSize: 17, 
    fontWeight: 'bold' 
  },
  retryButton: { 
    height: 50, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 8 
  },
  retryButtonText: { 
    fontSize: 15, 
    fontWeight: '600' 
  },
  countdownCard: {
    padding: 30,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  countdownIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  countdownTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: 'center'
  },
  countdownText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 10
  },
  countdownNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    lineHeight: 90
  },
  cancelEscalationButton: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelEscalationText: {
    fontSize: 16,
    fontWeight: '600'
  }
});
