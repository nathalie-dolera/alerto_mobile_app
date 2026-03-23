import { IconSymbol } from "@/components/ui/icon-symbol";
import { SettingsCard } from "@/components/ui/settings-card";
import { SettingsRow } from "@/components/ui/settings-row";
import { Colors } from "@/constants/color";
import { useAuth } from '@/context/auth';
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from "react-native";

export default function SettingsScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const [allowLocation, setAllowLocation] = useState(true);
    const [pushNotifications, setPushNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(theme === 'dark');
    const { user, logout } = useAuth();
    const displayName = user?.name || user?.email || "Guest User";

    const handleLogout = async () => {
      await logout();
      router.replace('/login'); 
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
          
          <Text style={[styles.profileName, { color: colors.mainText }]}>
            {displayName}
          </Text>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          DEVICE HEALTH
        </Text>

        <SettingsCard>
          <View style={styles.deviceHealthRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.watchEsp }]}>
              <IconSymbol name="watch" size={24} color={colors.lightning} />
            </View>
            <View style={styles.deviceHealthText}>
              <Text style={[styles.deviceTitle, { color: colors.mainText }]}>
                ESP32 Commuter Band
              </Text>
              <Text style={[styles.deviceSubtitle, { color: colors.subtitle }]}>
                Connected
              </Text>
            </View>
            <View style={styles.batteryContainer}>
                <Text style={styles.batteryText}>
                  85%
                </Text>
                <IconSymbol name="lightning" size={16} color={colors.lightning} />
            </View>

          </View>
        </SettingsCard>

        <Text style={[styles.sectionHeader, { color: colors.containerText }]}>
          ACCOUNT SETTINGS
        </Text>

        <SettingsCard>
          <SettingsRow icon="star" title="Saved Places" type="link" onPress={() => router.push('/save-place')}/>
            <SettingsRow 
            icon="location-sharp" 
            title="Allow Location" 
            type="toggle" 
            value={allowLocation} 
            onToggle={setAllowLocation}
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
            onToggle={setDarkMode} 
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

        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.logoutBackground, borderColor: colors.logoutBorder }]}
        onPress={handleLogout}>           
          <IconSymbol name="logout" size={22} color={colors.logoutText} />
            <Text style={styles.logoutText}>
              Logout Account
            </Text>
        </TouchableOpacity>
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
})