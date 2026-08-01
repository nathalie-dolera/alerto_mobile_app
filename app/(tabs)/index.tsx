import React, { useCallback, useEffect, useState } from 'react';
import { BleDeviceModal } from '@/components/ui/ble-device-modal';
import { DestinationCard } from '@/components/dashboard/destination-card';
import { QuickCard } from '@/components/dashboard/quick-card';
import { StatusCard } from '@/components/dashboard/status-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { useBleContext } from '@/context/ble-context';
import { useAntiTheftBle } from '@/context/anti-theft-ble-context';
import { useQuickDestinations } from '@/context/quick-destination';
import { useMapContext } from '@/context/map-context';
import { useSavedPlacesContext } from '@/context/saved-places';
import { EmergencyContact, EmergencyService } from '@/services/emergency-service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

export default function DashboardScreen() {
    const theme = (useColorScheme() ?? 'light') as 'light' | 'dark'; 
    const colors = Colors[theme]; 
    const router = useRouter();  
    
    const { savedPlaces } = useSavedPlacesContext();
    const { quickPlaceIds } = useQuickDestinations();
    const { connectedDevice, isScanning, devices, startScan, stopScan, connect, disconnect } = useBleContext();
    const { connectionStatus: antiTheftStatus, isAlerting: antiTheftAlerting } = useAntiTheftBle();
    const [isBleModalVisible, setIsBleModalVisible] = useState(false);
    const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
    const [smsEnabled, setSmsEnabled] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const loadData = async () => {
                const contacts = await EmergencyService.getContacts();
                setEmergencyContacts(contacts);
                
                const smsPref = await AsyncStorage.getItem('alerto_sms_enabled');
                if (smsPref !== null) {
                    setSmsEnabled(smsPref === 'true');
                }
            };
            loadData();
        }, [])
    );

    const handleSmsToggle = async (value: boolean) => {
        setSmsEnabled(value);
        await AsyncStorage.setItem('alerto_sms_enabled', value.toString());
    };

    const quickDestinations = savedPlaces.filter(place => 
    place.id && quickPlaceIds.includes(place.id)
);

const maxCards = 4;

    const { user } = useAuth();
    const { startAlarm } = useMapContext();

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{ 
                paddingBottom: 40, 
                paddingHorizontal: 24, 
                paddingTop: 60 }}>

            <View style={styles.header}>
                <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
                    Dashboard
                </ThemedText>
                <TouchableOpacity 
                    onPress={() => router.push('/settings')} 
                    style={[styles.profileCircle, {backgroundColor: colors.avatarBg}]}
                    activeOpacity={0.8}
                >
                    {user?.image ? (
                        <Image source={{ uri: user.image }} style={styles.profileImage} />
                    ) : (
                        <IconSymbol name="person.fill" size={24} color={colors.profileIcon} />
                    )}
                </TouchableOpacity>      
            </View> 

            <DestinationCard onPress={() => router.push('/map-select')}>
                <View> 
                    <ThemedText style={styles.cardLabel}>
                        SET ALARM
                    </ThemedText>
                    <ThemedText 
                    style={styles.cardTitle}>
                        Select Destination
                    </ThemedText>
                </View>
                <View style={styles.searchCircle}> 
                    <IconSymbol name='magnifyingglass' size={24} color="#fff" />
                </View>
            </DestinationCard>
            
            <DestinationCard 
                onPress={() => router.push('/(main)/booking-scanner')}
                style={{ 
                    backgroundColor: theme === 'light' ? '#E8EFFF' : colors.buttonBackground,
                    marginBottom: 20,
                    paddingVertical: 12, 
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <View>
                        <ThemedText style={[styles.cardLabel, { color: colors.mainText, opacity: 0.6 }]}>
                            Upload Your Ride
                        </ThemedText>
                        <ThemedText style={[styles.cardTitle, { color: colors.mainText, marginTop: 2 }]}>
                            Booking Screenshot
                        </ThemedText>
                    </View>
                    <View style={[styles.searchCircle, { backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
                        <IconSymbol name='sparkles' size={24} color={colors.mainText} />
                    </View>
                </View>
            </DestinationCard>

            <View style={styles.statusSection}>
                <ThemedText 
                style={[styles.statusHeader, { color: colors.mainText }]}>
                    Module Status
                </ThemedText>

                <ThemedText 
                style={[styles.statusSub, { color: colors.subtitle }]}>
                    Tap to connect to your module
                </ThemedText>
                
                <StatusCard onPress={() => {
                    if (connectedDevice) {
                        disconnect();
                    } else {
                        setIsBleModalVisible(true);
                        startScan();
                    }
                }}>
                    <View style={[styles.bluetoothCircle, { backgroundColor: connectedDevice ? '#48bb78' : '#3b4fb0' }]}>
                        <IconSymbol name={connectedDevice ? "bluetooth" : "bluetooth"} size={20} color="#fff" />
                    </View>
                    
                    <View>
                        <ThemedText 
                        style={styles.statusTitle}>
                            {connectedDevice ? 'CONNECTED' : 'DISCONNECTED'}
                        </ThemedText>
                        <ThemedText 
                        style={styles.batteryText}>
                            {connectedDevice ? 'Module is active' : 'Tap to connect'}
                        </ThemedText>
                    </View>
                </StatusCard>


            </View>

            {/* Emergency Contacts Section */}
            <View style={styles.emergencySection}>
                <ThemedText style={[styles.statusHeader, { color: colors.mainText }]}>
                    Emergency Settings
                </ThemedText>

                <ThemedText style={[styles.statusSub, { color: colors.subtitle, marginBottom: 12 }]}>
                    Notified during long-stop emergencies
                </ThemedText>



                {/* Emergency Contacts Card */}
                {emergencyContacts.length > 0 ? (
                    <TouchableOpacity 
                        style={[styles.contactsPreview, { 
                            backgroundColor: theme === 'light' ? '#eaf2ff' : colors.card,
                            borderColor: theme === 'light' ? '#cce0ff' : colors.hr
                        }]}
                        onPress={() => router.push('/(main)/emergency-contacts')}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.addContactIcon, { 
                            backgroundColor: theme === 'light' ? '#dbe6f5' : '#1e293b',
                            width: 38,
                            height: 38,
                            borderRadius: 19,
                        }]}>
                            <IconSymbol name="people-sharp" size={20} color={colors.activeCard} />
                        </View>
                        <View style={styles.contactsPreviewText}>
                            <Text style={[styles.contactsCount, { color: colors.mainText, fontWeight: 'bold' }]}>
                                Emergency Contacts
                            </Text>
                            <Text style={[styles.contactsActiveCount, { color: colors.subtitle }]}>
                                {emergencyContacts.length} contact{emergencyContacts.length !== 1 ? 's' : ''} saved
                            </Text>
                        </View>

                        {/* Optional: Minified Avatar Preview list on the right */}
                        <View style={[styles.contactAvatarsRow, { marginRight: 8 }]}>
                            {emergencyContacts.slice(0, 2).map((contact, idx) => (
                                <View 
                                    key={contact.id} 
                                    style={[
                                        styles.contactAvatar, 
                                        { 
                                            backgroundColor: (contact.isSelected !== false ? colors.activeCard : colors.subtitle) + '20',
                                            borderColor: theme === 'light' ? '#fff' : colors.card,
                                            marginLeft: idx > 0 ? -8 : 0,
                                            zIndex: 2 - idx,
                                            width: 30,
                                            height: 30,
                                            borderRadius: 15,
                                        }
                                    ]}
                                >
                                    <Text style={[styles.contactAvatarText, { 
                                        color: contact.isSelected !== false ? colors.activeCard : colors.subtitle,
                                        fontSize: 10,
                                    }]}>
                                        {contact.firstName[0]}{contact.lastName[0]}
                                    </Text>
                                </View>
                            ))}
                            {emergencyContacts.length > 2 && (
                                <View style={[styles.contactAvatar, { 
                                    backgroundColor: theme === 'light' ? '#dbe6f5' : '#1e293b',
                                    borderColor: theme === 'light' ? '#fff' : colors.card,
                                    marginLeft: -8,
                                    zIndex: 0,
                                    width: 30,
                                    height: 30,
                                    borderRadius: 15,
                                }]}>
                                    <Text style={[styles.contactAvatarText, { color: colors.subtitle, fontSize: 10 }]}>
                                        +{emergencyContacts.length - 2}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <IconSymbol name="chevron.right" size={18} color={colors.subtitle} />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity 
                        style={[styles.addContactCard, { 
                            backgroundColor: theme === 'light' ? '#eaf2ff' : colors.card,
                            borderColor: theme === 'light' ? '#cce0ff' : colors.hr
                        }]}
                        onPress={() => router.push('/(main)/emergency-contacts')}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.addContactIcon, { 
                            backgroundColor: theme === 'light' ? '#dbe6f5' : '#1e293b',
                            width: 38,
                            height: 38,
                            borderRadius: 19,
                        }]}>
                            <IconSymbol name="person.crop.circle.badge.plus" size={20} color={colors.activeCard} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.addContactTitle, { color: colors.mainText, fontWeight: 'bold' }]}>
                                Emergency Contacts
                            </Text>
                            <Text style={[styles.addContactSubtitle, { color: colors.subtitle }]}>
                                No contacts saved. Tap to add.
                            </Text>
                        </View>
                        <IconSymbol name="chevron.right" size={18} color={colors.subtitle} />
                    </TouchableOpacity>
                )}
            </View>

            <ThemedText 
                style={[styles.sectionTitle, { color: colors.mainText, marginTop: 10 }]}>
                Quick Destinations
            </ThemedText>

            {/*for quick destiantion boxes*/}
            <View style={styles.gridContainer}>
            {Array.from({ length: maxCards }).map((_, index) => {
                const place = quickDestinations[index]; 
                
                if (place) {
                    return (
                        <QuickCard 
                            key={place.id} 
                            title={place.name} 
                            iconName="location-sharp" 
                            isAdd={false}
                            onPress={() => {
                                router.push({
                                    pathname: '/set-alarm',
                                    params: { 
                                        placeName: place.name,
                                        distance: place.distance,
                                        intensity: place.intensity,
                                        duration: place.duration,
                                        lat: place.lat,
                                        lng: place.lng
                                    }
                                });
                            }}
                        />
                    );
                }
                return (
                    <QuickCard 
                        key={`add-${index}`} 
                        title="Add New" 
                        iconName="plus" 
                        isAdd={true} 
                        onPress={() => router.push('/(main)/save-place')}
                    />
                );
            })}
            </View>

            <TouchableOpacity onPress={() => router.push('/(main)/save-place')}>
                <ThemedText style={[styles.seeSavePlaces, { color: colors.mainText }]}>
                    SEE SAVE PLACES
                </ThemedText>
            </TouchableOpacity>

            <BleDeviceModal 
                visible={isBleModalVisible}
                onClose={() => {
                    setIsBleModalVisible(false);
                    stopScan();
                }}
                devices={devices}
                isScanning={isScanning}
                onConnect={async (device) => {
                    try {
                        await connect(device);
                        setIsBleModalVisible(false);
                        stopScan();
                    } catch (error) {
                        console.error('Failed to connect:', error);
                    }
                }}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        marginTop: -25,
    },
    title: {
        fontSize: 32,
        marginTop: 15,
        fontWeight: 'bold',
    },
    profileCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#091432',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        overflow: 'hidden'
    },
    profileImage: {
        width: '100%',
        height: '100%',
        borderRadius: 22,
    },
    cardLabel: {
        opacity: 0.8,
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 4,
        color: '#fff',

    },
    searchCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 15,
    },
    seeSavePlaces: {
        textAlign: 'right',
        fontSize: 12,
        fontWeight: '700',
        textDecorationLine: 'underline',
        marginTop: 10,
    },
    statusSection: {
        marginTop: 15,
    },
    statusHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#091432',
    },
    statusSub: {
        fontSize: 12,
        marginBottom: 12,
    },
    bluetoothCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#3b4fb0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    statusTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    batteryText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        marginTop: 2,
    },
    emergencySection: {
        marginTop: 20,
    },
    emergencySectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    manageLink: {
        fontSize: 14,
        fontWeight: '600',
    },
    smsToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        marginBottom: 10,
    },
    smsToggleLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    smsIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    smsToggleTitle: {
        fontSize: 15,
        fontWeight: '600',
    },
    smsToggleSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
    contactsPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
    },
    contactAvatarsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    contactAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
    },
    contactAvatarText: {
        fontSize: 13,
        fontWeight: 'bold',
    },
    contactsPreviewText: {
        flex: 1,
    },
    contactsCount: {
        fontSize: 15,
        fontWeight: '600',
    },
    contactsActiveCount: {
        fontSize: 12,
        marginTop: 1,
    },
    addContactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
    },
    addContactIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    addContactTitle: {
        fontSize: 15,
        fontWeight: '600',
    },
    addContactSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
});