import { DestinationCard } from '@/components/dashboard/destination-card';
import { QuickCard } from '@/components/dashboard/quick-card';
import { StatusCard } from '@/components/dashboard/status-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';

export default function DashboardScreen() {
    const colorScheme = useColorScheme();
    const theme = (useColorScheme() ?? 'light') as 'light' | 'dark'; 
    const colors = Colors[theme]; 
    const router = useRouter();  
    
    const savedPlaces: { id: string, name: string, icon: any }[] = []; 

    const maxCards = 4;

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
                <View style={[styles.profileCircle, {backgroundColor: colors.avatarBg}]}>
                    <IconSymbol name="person.fill" size={24} color={colors.profileIcon} />
                </View>         
            </View> 

            <DestinationCard onPress={() => router.push('/')}>
                <View> 
                    <ThemedText 
                    style={styles.cardLabel}>
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

            <ThemedText 
            style={[styles.sectionTitle, { color: colors.mainText }]}>
                Quick Destinations
            </ThemedText>

            {/*for quick destiantion boxes*/}
            <View style={styles.gridContainer}>
                {Array.from({ length: maxCards }).map((_, index) => {
                    const place = savedPlaces[index];
                    
                    if (place) {
                        return (
                            <QuickCard 
                                key={place.id} 
                                title={place.name} 
                                iconName={place.icon} 
                                isAdd={false}
                            />
                        );
                    }
                    return (
                        <QuickCard 
                            key={`add-${index}`} 
                            title="Add New" 
                            iconName="plus" 
                            isAdd={true} 
                        />
                    );
                })}
            </View>

            <ThemedText 
            style={[styles.seeSavePlaces, { color: colors.mainText}]}>
                SEE SAVE PLACES
            </ThemedText>

            <View style={styles.statusSection}>
                <ThemedText 
                style={[styles.statusHeader, { color: colors.mainText }]}>
                    Wearable Status
                </ThemedText>

                <ThemedText 
                style={[styles.statusSub, { color: colors.subtitle }]}>
                    Tap to connect to your wearable device
                </ThemedText>
                
                <StatusCard>
                    <View style={styles.bluetoothCircle}>
                        <IconSymbol name="bluetooth" size={20} color="#fff" />
                    </View>
                    
                    <View>
                        <ThemedText 
                        style={styles.statusTitle}>
                            CONNECTED
                        </ThemedText>
                        <ThemedText 
                        style={styles.batteryText}>
                            Battery: 85%
                        </ThemedText>
                    </View>
                </StatusCard>
            </View>
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
        marginBottom: 24,
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
        marginTop: -45,
    },
    statusSection: {
        marginTop: 30,
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
    }
});