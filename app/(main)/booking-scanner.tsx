import { CustomAlertButton, CustomAlertModal } from '@/components/ui/custom-alert-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { EmergencyContact, EmergencyService } from '@/services/emergency-service';
import { OcrService, RideDetails } from '@/services/ocr-service';
import { SmsService } from '@/services/sms-service';
import { StorageService } from '@/services/storage-service';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  useColorScheme,
  Switch
} from 'react-native';


async function sendBookingHeartbeat(userId: string) {
  try {
    const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
    const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api/mobile`;
    await fetch(`${API_URL}/commute/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, active: true }),
    });
  } catch (e) {
    console.warn('Booking heartbeat failed:', e);
  }
}

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
  const [selectedContacts, setSelectedContacts] = useState<Record<string, boolean>>({});
  const [sendStatus, setSendStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'failed'>>({});

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
        const selected = activeContacts.filter(c => selectedContacts[c.id]);
        handleSendAlert(screenshotUrl, selected.length > 0 ? selected : activeContacts);
      }
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCountingDown, countdownSeconds, screenshotUrl]);

  const handleCancelCountdown = () => {
    setIsCountingDown(false);
    setCountdownSeconds(10);
  };

  const handleImmediateSend = () => {
    setIsCountingDown(false);
    if (screenshotUrl) {
      const selected = activeContacts.filter(c => selectedContacts[c.id]);
      handleSendAlert(screenshotUrl, selected.length > 0 ? selected : activeContacts);
    }
  };

  const [hasAutoScanned, setHasAutoScanned] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void EmergencyService.setUserId(user?.id);
      loadActiveContacts();
      if (!hasAutoScanned && !imageUri) {
        void checkAndLoadRecentScreenshot();
      }
    }, [user?.id, hasAutoScanned, imageUri])
  );

  const checkAndLoadRecentScreenshot = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        const media = await MediaLibrary.getAssetsAsync({
          first: 10,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [MediaLibrary.SortBy.creationTime],
        });

        if (media.assets && media.assets.length > 0) {
          const latestAsset = media.assets[0];
          const assetInfo = await MediaLibrary.getAssetInfoAsync(latestAsset);
          const uri = assetInfo.localUri || latestAsset.uri;
          if (uri) {
            setHasAutoScanned(true);
            setImageUri(uri);
            void handleSync(uri, "");
          }
        }
      }
    } catch (e) {
      console.warn("Auto screenshot detection error:", e);
    }
  };

  const loadActiveContacts = async () => {
    const allContacts = await EmergencyService.getContacts();
    setActiveContacts(allContacts);
    
    const initialSelection: Record<string, boolean> = {};
    const initialSendStatus: Record<string, 'idle' | 'sending' | 'sent' | 'failed'> = {};
    allContacts.forEach(c => {
      initialSelection[c.id] = c.isSelected !== false;
      initialSendStatus[c.id] = 'idle';
    });
    setSelectedContacts(initialSelection);
    setSendStatus(initialSendStatus);
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
        void handleSync(result.assets[0].uri, result.assets[0].base64 || "");
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

    let imageBase64 = base64;
    if (!imageBase64 && uri) {
      try {
        // Use ImageManipulator for reliable base64 extraction from any URI
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        imageBase64 = manipulated.base64 || '';
      } catch (manipErr) {
        console.warn('ImageManipulator failed, falling back to FileSystem:', manipErr);
        try {
          imageBase64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
        } catch (error) {
          console.error("Failed to read screenshot file:", error);
        }
      }
    }

    const extracted = await OcrService.parseRideScreenshot(imageBase64);

    if (extracted) {
      setDetails(extracted);
    } else {
      const errorMessage = OcrService.getLastError() || "AI could not read the screenshot. Please try another one.";
      showAlert("Sync Error", errorMessage, undefined, "alert-outline", colors.dangerIcon);
      // Keep imageUri so the user still sees their image preview!
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

      // Store active ride details locally for route deviation/long stop SOS alerts
      try {
        await AsyncStorage.setItem('@active_ride_details', JSON.stringify({
          bookingType: details.bookingType || 'Grab',
          driverName: details.driverName || 'N/A',
          plateNumber: details.plateNumber || 'NONE',
          carModel: details.carModel || 'N/A',
          destinationName: details.destinationName || '',
          screenshotUrl: uploadedUrl
        }));
        console.log('Stored active ride details in AsyncStorage');
      } catch (err) {
        console.error('Failed to store active ride details:', err);
      }

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
            type: 'booking',
            destinationName: details.destinationName || "Synced Ride",
            locationName: "Current Location",
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

        if (user?.id) void sendBookingHeartbeat(user.id);
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

  const handleSendAlert = async (imgUrl: string, targetContacts?: any[]) => {
    const contactsToSend = targetContacts || activeContacts.filter(c => selectedContacts[c.id]);
    if (contactsToSend.length === 0) {
      showAlert("No Selected Contacts", "You haven't selected any emergency contacts to receive alerts. Please check them in Settings.", undefined, "account-alert", colors.warningIcon);
      return;
    }

    const smsPref = await AsyncStorage.getItem('alerto_sms_enabled');
    const smsEnabled = smsPref !== 'false';
    if (!smsEnabled) {
      showAlert(
        "SMS Alerts Disabled",
        "Emergency SMS alerts are currently disabled. Would you like to enable them now to send this alert?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Enable & Send", 
            onPress: async () => {
              await AsyncStorage.setItem('alerto_sms_enabled', 'true');
              await executeSendAlert(imgUrl, contactsToSend);
            }
          }
        ],
        "message-text",
        colors.warningIcon
      );
      return;
    }

    await executeSendAlert(imgUrl, contactsToSend);
  };

  const executeSendAlert = async (imgUrl: string, contactsToSend: any[]) => {
    //get current location
    let locationUrl = "";
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      locationUrl = `https://alerto-web-system.vercel.app/map?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`;
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

    for (const contact of contactsToSend) {
      setSendStatus(prev => ({ ...prev, [contact.id]: 'sending' }));
      const result = await SmsService.sendSms(contact.phoneNumber, message);
      if (result.success) {
        setSendStatus(prev => ({ ...prev, [contact.id]: 'sent' }));
      } else {
        setSendStatus(prev => ({ ...prev, [contact.id]: 'failed' }));
        allSuccess = false;
        errorMessage = result.error || "Failed to send SMS";
      }
    }

    if (allSuccess) {
      showAlert("Alert Sent! ✅", "Your emergency contacts have been notified with your ride details.", [
        { text: "OK", onPress: () => router.back() }
      ], "checkmark.circle.fill", colors.successIcon);
    } else {
      showAlert(
        "Send Failure",
        `One or more alerts could not be sent. Please check your SMS provider account and try again.`,
        [{ text: "OK" }],
        "alert-circle",
        colors.dangerIcon
      );
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
            SENDING
          </Text>
          <Text style={[styles.countdownText, { color: colors.subtitle }]}>
            Your emergency contacts will be notified in:
          </Text>
          <Text style={[styles.countdownNumber, { color: colors.text }]}>{countdownSeconds}</Text>

          <TouchableOpacity
            style={[styles.sendNowButton, { backgroundColor: colors.activeCard }]}
            onPress={handleImmediateSend}
          >
            <Text style={[styles.sendNowText, { color: colors.activeText }]}>
              Send Now
            </Text>
          </TouchableOpacity>

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
            <IconSymbol name="location-sharp" size={20} color={colors.activeCard} />
            <View style={styles.detailText}>
              <Text style={[styles.detailLabel, { color: colors.subtitle }]}>
                Destination
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
                {details.destinationName || "Unknown"}
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
                {activeContacts.filter(c => selectedContacts[c.id]).map(c => `${c.firstName} ${c.lastName}`).join(', ') || 'No contacts selected'}
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
            style={[styles.outlineButton, { borderColor: colors.activeCard }]}
            onPress={pickImage}
            disabled={isUploading}
          >
            <IconSymbol name="photo.fill" size={18} color={colors.activeCard} />
            <Text style={[styles.outlineButtonText, { color: colors.activeCard }]}>
              Change Screenshot
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!details && !isScanning) {
      return (
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.hr, padding: 18 }]}>
          <Text style={[styles.title, { color: colors.text, fontSize: 17, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }]}>
            Screenshot Ready
          </Text>
          <Text style={[styles.subtitle, { color: colors.subtitle, fontSize: 13, marginBottom: 16, textAlign: 'center' }]}>
            Scan this booking to extract details, or select a different photo.
          </Text>

          {/* Solid Blue Scan Button */}
          <TouchableOpacity
            style={[styles.confirmButton, { backgroundColor: colors.activeCard, marginTop: 0 }]}
            onPress={() => imageUri && handleSync(imageUri, "")}
            disabled={isScanning}
          >
            <IconSymbol name="sparkles" size={20} color={colors.activeText} />
            <Text style={[styles.confirmButtonText, { color: colors.activeText }]}>
              Scan Booking
            </Text>
          </TouchableOpacity>

          {/* Bordered Blue Change Screenshot Button */}
          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: colors.activeCard }]}
            onPress={pickImage}
            disabled={isScanning}
          >
            <IconSymbol name="photo.fill" size={18} color={colors.activeCard} />
            <Text style={[styles.outlineButtonText, { color: colors.activeCard }]}>
              Change Screenshot
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
          Booking Scanner
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
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
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.hr }]}>
              <View style={[styles.iconLarge, { backgroundColor: theme === 'dark' ? '#1e293b' : colors.activeCard + '10' }]}>
                <IconSymbol name="sparkles" size={50} color={colors.activeCard} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Scan Your Booking</Text>
              <Text style={[styles.subtitle, { color: colors.subtitle }]}>
                Alerto automatically detects your recent booking screenshot, or you can select one from your gallery.
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.activeCard }]}
                onPress={pickImage}
              >
                <IconSymbol name="photo.fill" size={20} color={colors.activeText} />
                <Text style={[styles.primaryButtonText, { color: colors.activeText }]}>
                  Change Selected Screenshot
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Emergency Contacts — ALWAYS visible */}
          <View style={[styles.contactsCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
            <View style={styles.contactsHeader}>
              <Text style={[styles.contactsTitle, { color: colors.text }]}>Emergency Contacts</Text>
              <IconSymbol name="people-sharp" size={20} color={colors.subtitle} />
            </View>
            
            <Text style={[styles.contactsDescription, { color: colors.subtitle, marginBottom: 12 }]}>
              Toggle who will receive SMS alerts, and view sending status.
            </Text>
            
            {activeContacts.length === 0 ? (
              <View style={styles.noContactsContainer}>
                <Text style={[styles.noContactsText, { color: colors.subtitle }]}>
                  No contact registered yet.
                </Text>
                <TouchableOpacity
                  style={[styles.addContactBtn, { backgroundColor: colors.activeCard + '20' }]}
                  onPress={() => router.push('/(main)/emergency-contacts')}
                >
                  <Text style={[styles.addContactBtnText, { color: colors.activeCard }]}>Add Contact</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Select All, Send Selected, Send All buttons */}
                <View style={[styles.bulkActionsRow, !screenshotUrl && { justifyContent: 'flex-end' }]}>
                  <TouchableOpacity
                    style={styles.selectAllToggle}
                    onPress={() => {
                      const allSelected = Object.values(selectedContacts).every(v => v);
                      const nextSelection: Record<string, boolean> = {};
                      activeContacts.forEach(c => {
                        nextSelection[c.id] = !allSelected;
                      });
                      setSelectedContacts(nextSelection);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.selectAllText, { color: colors.mainText, marginRight: 8 }]}>Select All</Text>
                    <IconSymbol 
                      name={activeContacts.length > 0 && Object.values(selectedContacts).every(v => v) ? "checkmark.square.fill" : "square"} 
                      size={20} 
                      color={colors.activeCard} 
                    />
                  </TouchableOpacity>

                  {screenshotUrl && (
                    <View style={styles.sendButtonsRow}>
                      <TouchableOpacity
                        style={[styles.actionSendBtn, { backgroundColor: colors.activeCard }]}
                        onPress={() => handleSendAlert(screenshotUrl, activeContacts.filter(c => selectedContacts[c.id]))}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionSendBtnText}>Send Selected</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionSendBtn, { backgroundColor: colors.primaryIcon }]}
                        onPress={() => handleSendAlert(screenshotUrl, activeContacts)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionSendBtnText}>Send to All</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Contacts List */}
                {activeContacts.map((contact, index) => {
                  const isSelected = selectedContacts[contact.id] ?? false;
                  const status = sendStatus[contact.id] ?? 'idle';
                  
                  let statusLabel = '';
                  let statusColor = colors.subtitle;
                  if (status === 'sending') {
                    statusLabel = 'Sending...';
                    statusColor = '#eab308';
                  } else if (status === 'sent') {
                    statusLabel = 'Sent ✅';
                    statusColor = '#48bb78';
                  } else if (status === 'failed') {
                    statusLabel = 'Failed ❌';
                    statusColor = colors.locationMarker;
                  }

                  return (
                    <View key={index} style={[styles.contactRow, { borderBottomColor: colors.hr, borderBottomWidth: index === activeContacts.length - 1 ? 0 : 1 }]}>
                      <TouchableOpacity
                        style={styles.checkboxTouch}
                        onPress={() => {
                          setSelectedContacts(prev => ({ ...prev, [contact.id]: !isSelected }));
                        }}
                      >
                        <IconSymbol 
                          name={isSelected ? "checkmark.circle.fill" : "circle"} 
                          size={22} 
                          color={isSelected ? colors.activeCard : colors.subtitle + '40'} 
                        />
                      </TouchableOpacity>

                      <View style={[styles.contactAvatar, { backgroundColor: colors.activeCard + '20' }]}>
                        <Text style={[styles.contactInitials, { color: colors.activeCard }]}>
                          {(contact.firstName?.charAt(0) || '') + (contact.lastName?.charAt(0) || '')}
                        </Text>
                      </View>

                      <View style={styles.contactDetails}>
                        <Text style={[styles.contactName, { color: colors.text }]}>
                          {contact.firstName} {contact.lastName}
                        </Text>
                        <Text style={[styles.contactRel, { color: colors.subtitle }]}>
                          {contact.relationship} • {contact.phoneNumber}
                        </Text>
                      </View>

                      <View style={styles.statusBadge}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                  );
                })}

                <TouchableOpacity
                  style={styles.addMoreBtn}
                  onPress={() => router.push('/(main)/emergency-contacts')}
                >
                  <IconSymbol name="plus" size={16} color={colors.activeCard} />
                  <Text style={[styles.addMoreText, { color: colors.activeCard }]}>Add More</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
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
    paddingBottom: 8
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 8,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
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
  outlineButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
    backgroundColor: 'transparent',
    width: '100%',
  },
  outlineButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
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
  sendNowButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendNowText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelEscalationButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%'
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
  },
  contactsCard: {
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  contactsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  contactsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  contactsDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  noContactsContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  noContactsText: {
    fontSize: 15,
    marginBottom: 16,
  },
  addContactBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addContactBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInitials: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  contactRel: {
    fontSize: 13,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  addMoreText: {
    fontSize: 15,
    fontWeight: '600',
  },
  bulkActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  selectAllToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sendButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionSendBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSendBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  checkboxTouch: {
    padding: 4,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'flex-end',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  }
});
