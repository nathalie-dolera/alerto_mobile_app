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
  Modal,
  Platform,
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

  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
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
    setCountdownSeconds(10);
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

    try {
      if (!ImagePicker.launchImageLibraryAsync) {
        throw new Error("ImagePicker native module not found. Please rebuild the app.");
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
    } catch (error: any) {
      console.error("ImagePicker Error:", error);
      showAlert(
        "Feature Unavailable",
        "The image scanner requires native components that are missing. Please ensure you are using the latest version of the app.",
        undefined,
        "exclamationmark.triangle",
        colors.dangerIcon
      );
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
        setCountdownSeconds(10);

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
      plateNumber: details?.plateNumber || "NONE",
      driverName: details?.driverName || "N/A",
      carModel: details?.carModel || "N/A",
      screenshotUrl: imgUrl,
      locationUrl: locationUrl,
      senderName: user?.name || user?.email || "Alerto User",
      senderEmail: user?.email,
      isEmergency: false
    });

    let allSuccess = true;
    let errorMessage = "";

    for (const contact of activeContacts) {
      const result = await SmsService.sendSms(contact.phoneNumber, message);
      if (!result.success) {
        allSuccess = false;
        errorMessage = result.error || "Failed to send SMS";
      }
    }

    if (allSuccess) {
      showAlert("Alert Sent", "SMS alerts have been sent to your emergency contacts.", [
        { text: "OK", onPress: () => router.back() }
      ], "check-circle", colors.successIcon);
    } else {
      showAlert("Send Failure", `One or more alerts failed to send: ${errorMessage}. Please check your SMS provider account.`, undefined, "alert-circle", colors.dangerIcon);
    }
  };

  const renderSyncContent = () => {
    if (isCountingDown) {
      return (
        <View style={[styles.countdownCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <View style={[styles.countdownIconBg, { backgroundColor: colors.dangerIcon + '20' }]}>
            <IconSymbol name="shield-alert" size={50} color={colors.dangerIcon} />
          </View>
          <Text style={[styles.countdownTitle, { color: colors.dangerIcon }]}>
            SENDING SOS ALERT
          </Text>
          <Text style={[styles.countdownText, { color: colors.subtitle }]}>
            Your emergency contacts will be notified in:
          </Text>
          <Text style={[styles.countdownNumber, { color: colors.text }]}>{countdownSeconds}</Text>

          <TouchableOpacity
            style={[styles.cancelEscalationButton, { borderColor: colors.hr }]}
            onPress={handleCancelCountdown}
          >
            <Text style={[styles.cancelEscalationText, { color: colors.subtitle }]}>
              Cancel Alert
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (details && !isScanning) {
      //branding 
      const isGrab = details.bookingType === 'Grab';
      const activeColor = isGrab ? '#ef4444' : '#3b82f6';

      const vehicleIcon = isGrab ? "car.2.fill" : "bicycle";
      const appIcon = isGrab ? "car.fill" : "bicycle";

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
                {details.plateNumber || "NONE"}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <IconSymbol name="car.2.fill" size={20} color={colors.activeCard} />
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.subtitle }]}>
                Vehicle
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {details.carModel || "N/A"}
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
                {activeContacts.map(c => `${c.firstName} ${c.lastName}`).join(', ')}
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
                  Confirm
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

      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsImageModalVisible(false)}
        >
          <View style={styles.fullscreenImageContainer}>
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              style={styles.closePreviewBtn}
              onPress={() => setIsImageModalVisible(false)}
            >
              <IconSymbol name="xmark" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Booking Screenshot Scanner
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {imageUri ? (
          <View style={styles.syncState}>
            <TouchableOpacity
              style={[styles.imageContainer, { backgroundColor: colors.card, borderColor: colors.hr }]}
              onPress={() => setIsImageModalVisible(true)}
              activeOpacity={0.9}
            >
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
              {isScanning && (
                <View style={styles.scanningOverlay}>
                  <ActivityIndicator size="large" color={colors.activeText} />
                  <Text style={[styles.scanningText, { color: colors.activeText }]}>
                    AI is scanning screenshots...
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {renderSyncContent()}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.iconLarge, { backgroundColor: colors.activeCard + '10' }]}>
              <IconSymbol name="sparkles" size={50} color={colors.activeCard} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Scan Your Booking</Text>
            <Text style={[styles.subtitle, { color: colors.subtitle }]}>
              Take a screenshot of your booking and let Alerto extract details automatically.
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
      </View>
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
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 20
  },
  iconLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30
  },
  primaryButton: {
    height: 56,
    width: '100%',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: 'bold'
  },
  syncState: {
    flex: 1,
    width: '100%'
  },
  imageContainer: {
    width: '100%',
    height: 250,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
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
    fontSize: 14,
    fontWeight: '600'
  },
  detailsCard: {
    padding: 16,
    paddingBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    marginTop: 0,
  },
  detailsTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  detailText: {
    marginLeft: 12,
    flex: 1
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '600'
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 1
  },
  confirmButton: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  retryButton: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600'
  },
  countdownCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  countdownIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15
  },
  countdownTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
    textAlign: 'center'
  },
  countdownText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 10
  },
  countdownNumber: {
    fontSize: 60,
    fontWeight: 'bold',
    lineHeight: 70
  },
  cancelEscalationButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelEscalationText: {
    fontSize: 15,
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  fullscreenImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center'
  },
  fullscreenImage: {
    width: '95%',
    height: '85%'
  },
  closePreviewBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center'
  }
});



