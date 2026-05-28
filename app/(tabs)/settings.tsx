
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SettingsCard } from "@/components/ui/settings-card";
import { SettingsRow } from "@/components/ui/settings-row";
import { Colors } from "@/constants/color";
import { useAuth } from '@/context/auth';
import { useBleContext } from "@/context/ble-context";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Appearance, Image, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View, Modal } from "react-native";
import { RoundedInput } from "@/components/ui/rounded-input";
import { ModalContainer } from "@/components/ui/modal-container";

export default function SettingsScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const [allowLocation, setAllowLocation] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(theme === 'dark');
    const { user, logout, updateUser } = useAuth();
    const { connectedDevice, sensorData } = useBleContext();
    const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
    const [isGuideModalVisible, setIsGuideModalVisible] = useState(false);
    const [newName, setNewName] = useState("");
    
    const displayName = user?.name || user?.email || "Guest User";

    const handleSaveName = async () => {
        if (newName.trim()) {
            await updateUser({ name: newName.trim() });
            setIsRenameModalVisible(false);
        }
    };

    useEffect(() => {
        const initLocationToggle = async () => {
            const pref = await AsyncStorage.getItem('alerto_allow_location');
            if (pref === null) {
                const { status } = await Location.getForegroundPermissionsAsync();
                const isGranted = status === 'granted';
                setAllowLocation(isGranted);
            } else {
                setAllowLocation(pref === 'true');
            }
        };
        initLocationToggle();
    }, []);

    const handleLocationToggle = async (value: boolean) => {
        setAllowLocation(value);
        await AsyncStorage.setItem('alerto_allow_location', value.toString());
    };

    const handleLogout = async () => {
      await logout();
      router.replace('/login'); 
    };

    const handleDarkModeToggle = (value: boolean) => {
      setDarkMode(value);
      Appearance.setColorScheme(value ? 'dark' : 'light');
    };



    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <View style={styles.profileContainer}>
          {user?.image ? (
            <Image source={{ uri: user.image }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: colors.card }]}>
              <IconSymbol name="person.fill" size={40} color={colors.icon} />
            </View>
          )}
          
          <View style={styles.nameRow}>
            <Text style={[styles.profileName, { color: colors.mainText }]}>
              {displayName}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                setNewName(user?.name || "");
                setIsRenameModalVisible(true);
              }} 
              style={styles.editIconContainer}
            >
              <IconSymbol name="pencil" size={18} color={colors.icon} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          HARDWARE DIAGNOSTICS
        </Text>

        <SettingsCard>
          <View style={styles.deviceHealthRow}>
            <View style={[styles.iconCircle, { backgroundColor: connectedDevice ? colors.watchEsp : colors.card }]}>
              <IconSymbol name="cpu" size={24} color={connectedDevice ? colors.lightning : colors.subtitle} />
            </View>
            <View style={styles.deviceHealthText}>
              <Text style={[styles.deviceTitle, { color: colors.mainText }]}>
                ESP32 Wearable
              </Text>
              <Text style={[styles.deviceSubtitle, { color: connectedDevice ? '#48bb78' : colors.subtitle }]}>
                {connectedDevice ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
          
          <View style={styles.deviceHealthRow}>
            <View style={[styles.iconCircle, { backgroundColor: connectedDevice ? colors.watchEsp : colors.card }]}>
              <IconSymbol name="move.3d" size={24} color={connectedDevice ? colors.lightning : colors.subtitle} />
            </View>
            <View style={styles.deviceHealthText}>
              <Text style={[styles.deviceTitle, { color: colors.mainText }]}>
                MPU6050 Motion Sensor
              </Text>
              <Text style={[styles.deviceSubtitle, { color: connectedDevice ? '#48bb78' : colors.subtitle }]}>
                {connectedDevice ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.deviceHealthRow}>
            <View style={[styles.iconCircle, { backgroundColor: connectedDevice && (sensorData?.heartRate ?? 0) > 0 ? colors.watchEsp : colors.card }]}>
              <IconSymbol name="heart.text.square" size={24} color={connectedDevice && (sensorData?.heartRate ?? 0) > 0 ? colors.lightning : colors.subtitle} />
            </View>
            <View style={styles.deviceHealthText}>
              <Text style={[styles.deviceTitle, { color: colors.mainText }]}>
                MAX30102 Vitals Sensor
              </Text>
              <Text style={[styles.deviceSubtitle, { color: connectedDevice && (sensorData?.heartRate ?? 0) > 0 ? '#48bb78' : colors.subtitle }]}>
                {connectedDevice && (sensorData?.heartRate ?? 0) > 0 ? 'Reading' : 'Standby'}
              </Text>
            </View>
          </View>

          <View style={styles.deviceHealthRow}>
            <View style={[styles.iconCircle, { backgroundColor: connectedDevice && sensorData?.latitude ? colors.watchEsp : colors.card }]}>
              <IconSymbol name="location-sharp" size={24} color={connectedDevice && sensorData?.latitude ? colors.lightning : colors.subtitle} />
            </View>
            <View style={styles.deviceHealthText}>
              <Text style={[styles.deviceTitle, { color: colors.mainText }]}>
                GPS Module
              </Text>
              <Text style={[styles.deviceSubtitle, { color: connectedDevice && sensorData?.latitude ? '#48bb78' : colors.subtitle }]}>
                {connectedDevice && sensorData?.latitude ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View style={styles.deviceHealthRow}>
            <View style={[styles.iconCircle, { backgroundColor: connectedDevice ? colors.watchEsp : colors.card }]}>
              <IconSymbol name="bolt.fill" size={24} color={connectedDevice ? colors.lightning : colors.subtitle} />
            </View>
            <View style={styles.deviceHealthText}>
              <Text style={[styles.deviceTitle, { color: colors.mainText }]}>
                Vibration Motor
              </Text>
              <Text style={[styles.deviceSubtitle, { color: connectedDevice ? '#48bb78' : colors.subtitle }]}>
                {connectedDevice ? 'Ready' : 'Offline'}
              </Text>
            </View>
          </View>
        </SettingsCard>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          ACCOUNT SETTINGS
        </Text>

        <SettingsCard>
          <SettingsRow icon="star" title="Saved Places" type="link" onPress={() => router.push('/save-place')}/>
          <SettingsRow 
            icon="people-sharp" 
            title="Emergency Contacts" 
            type="link" 
            onPress={() => router.push('/(main)/emergency-contacts')}
          />
            <SettingsRow 
            icon="location-sharp" 
            title="Allow Location" 
            type="toggle" 
            value={allowLocation} 
            onToggle={handleLocationToggle}
            />
            <SettingsRow 
            icon="bell" 
            title="Push Notifications" 
            type="toggle" 
            value={pushNotifications} 
            onToggle={setPushNotifications}
            />
            <SettingsRow 
            icon="moon" 
            title="Dark Mode" 
            type="toggle" 
            value={darkMode} 
            onToggle={handleDarkModeToggle} 
            isLast={true}/>
        </SettingsCard>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          DEFAULT ALARM SETTINGS
        </Text>

        <SettingsCard>
          <SettingsRow 
          icon="clock.fill" 
          title="Configure Alarms" 
          type="link" 
          isLast={true} 
          onPress={() => router.push({
            pathname: '/alarm-config',
            params: { isGlobalDefault: 'true'}
          })}/>
        </SettingsCard>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          USER GUIDE
        </Text>

        <SettingsCard>
          <SettingsRow
            icon="information-circle"
            title="Snore Monitoring Guide"
            type="link"
            isLast={true}
            onPress={() => setIsGuideModalVisible(true)}
          />
        </SettingsCard>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          ACCOUNT TYPE
        </Text>

        <SettingsCard>
          <SettingsRow
            icon="car.fill"
            title="Switch to Driver"
            type="link"
            isLast={true}
            onPress={async () => {
              await updateUser({ purpose: 'driver' });
              router.replace('/(driver)');
            }}
          />
        </SettingsCard>

        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.logoutBackground, borderColor: colors.logoutBorder }]}
        onPress={handleLogout}>           
          <IconSymbol name="logout" size={22} color={colors.logoutText} />
            <Text style={styles.logoutText}>
              Logout Account
            </Text>
        </TouchableOpacity>



        <Modal
            transparent={true}
            visible={isRenameModalVisible}
            animationType="fade"
            onRequestClose={() => setIsRenameModalVisible(false)}
        >
            <ModalContainer onClose={() => setIsRenameModalVisible(false)}>
                <Text style={[styles.modalTitle, { color: colors.mainText }]}>Rename User</Text>
                <RoundedInput
                    placeholder="Enter new name"
                    value={newName}
                    onChangeText={setNewName}
                />
                <View style={styles.modalButtons}>
                    <TouchableOpacity 
                        style={[styles.modalButton, { backgroundColor: colors.card }]} 
                        onPress={() => setIsRenameModalVisible(false)}
                    >
                        <Text style={{ color: colors.mainText, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <View style={{ width: 16 }} />
                    <TouchableOpacity 
                        style={[styles.modalButton, { backgroundColor: colors.modalSave }]} 
                        onPress={handleSaveName}
                    >
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirm</Text>
                    </TouchableOpacity>
                </View>
            </ModalContainer>
        </Modal>

        <Modal
            transparent={true}
            visible={isGuideModalVisible}
            animationType="fade"
            onRequestClose={() => setIsGuideModalVisible(false)}
        >
            <ModalContainer onClose={() => setIsGuideModalVisible(false)}>
                <Text style={[styles.modalTitle, { color: colors.mainText }]}>Snore Monitoring Guide</Text>
                <Text style={[styles.guideText, { color: colors.subtitle }]}>
                    <Text style={[styles.guideLabel, { color: colors.mainText }]}>Forearm:</Text> Best for comfortable long-term sleep monitoring while still capturing heart rate and oxygen changes.
                    {"\n\n"}<Text style={[styles.guideLabel, { color: colors.mainText }]}>Wrist:</Text> Best for vibration alerts because users can easily feel the wearable buzz.
                    {"\n\n"}<Text style={[styles.guideLabel, { color: colors.mainText }]}>Privacy:</Text> ALERTO does not record audio. It uses MAX30102 sensor data instead.
                    {"\n\n"}Supported by Longmore et al. (2019) and Wersényi (2022).
                </Text>
                <TouchableOpacity
                    style={[styles.guideButton, { backgroundColor: colors.modalSave }]}
                    onPress={() => setIsGuideModalVisible(false)}
                >
                    <Text style={styles.guideButtonText}>Got it</Text>
                </TouchableOpacity>
            </ModalContainer>
        </Modal>
      </ScrollView>

    )
}

const styles = StyleSheet.create ({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 35,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    alignItems: 'center'
  },
  profileContainer: {
    alignItems: 'center',
    marginBottom: 35,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIconContainer: {
    marginLeft: 8,
    padding: 4,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4
  }, 
  deviceHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  deviceHealthText: {
    flex: 1,
    marginLeft: 12
  },
  deviceTitle: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  deviceSubtitle: {
    fontSize: 13,
    marginTop: 2
  },
  batteryText: {
    fontSize: 13,
    marginTop: 2
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  disconnectBtn: {
    padding: 8,
  },
  logoutButton: { 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 5,
    gap: 8 
  },
  logoutText: {
    color: '#e53e3e',
    fontSize: 16,
    fontWeight: 'bold' 
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideText: {
    fontSize: 15,
    lineHeight: 22,
  },
  guideLabel: {
    fontWeight: '700',
  },
  guideButton: {
    marginTop: 22,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  guideButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
})
