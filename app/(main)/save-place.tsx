import { IconSymbol } from '@/components/ui/icon-symbol';
import { SavedLocationCard } from '@/components/ui/saved-location';
import { Colors } from '@/constants/color';
import { useQuickDestinations } from '@/context/quick-destination';
import { useSavedPlacesContext } from '@/context/saved-places';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useColorScheme } from 'react-native';

export default function SavedPlacesScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    
    const { savedPlaces, isLoadingSaved, deleteSavedPlace } = useSavedPlacesContext();
    const { quickPlaceIds, toggleQuickPlace } = useQuickDestinations();    
    const [searchQuery, setSearchQuery] = useState('');

    const filteredSavedPlaces = useMemo(() => {
        if (!searchQuery.trim()) return savedPlaces;
        return savedPlaces.filter(place => 
            place.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [savedPlaces, searchQuery]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <IconSymbol name="chevron.left" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    Saved Places
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                <View style={[styles.searchSection, { backgroundColor: colors.card, borderColor: colors.hr }]}>
                    <IconSymbol name="magnifyingglass" size={20} color={colors.subtitle} />
                    <TextInput 
                        placeholder="Search your saved places..." 
                        placeholderTextColor={colors.subtitle}
                        style={[styles.searchInput, { color: colors.text }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                {isLoadingSaved ? (
                    <ActivityIndicator size="large" color={colors.activeCard} style={{ marginTop: 40 }} />
                ) : filteredSavedPlaces.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.subtitle }]}>
                        {searchQuery ? "No results found" : "No saved places yet"}
                    </Text>
                ) : (
                    filteredSavedPlaces.map((place) => {                        
                        const isQuick = place.id ? quickPlaceIds.includes(place.id) : false; 

                        return (
                            <View key={place.id} style={styles.cardWrapper}>
                                <SavedLocationCard 
                                    name={place.name}
                                    address={`Lat: ${place.lat.toFixed(5)} / Lng: ${place.lng.toFixed(5)}`}
                                    onSetAlarm={() => router.push({
                                        pathname: '/(tabs)/alerts',
                                        params: { activeDestination: place.name }
                                    })}
                                    onEdit={() => router.push({
                                        pathname: '/alarm-config',
                                        params: { 
                                            placeId: place.id,
                                            placeName: place.name,
                                            distance: place.distance,
                                            intensity: place.intensity,
                                            duration: place.duration 
                                        }
                                    })}
                                    onDelete={() => place.id && deleteSavedPlace(place.id)}
                                />
                                
                                <TouchableOpacity 
                                    style={[
                                        styles.quickAddBtn, 
                                        { backgroundColor: isQuick ? colors.activeCard : colors.activeCard + '20' }
                                    ]}
                                    onPress={() => {
                                        if (place.id) {
                                            toggleQuickPlace(place.id);
                                        }
                                    }}
                                >
                                    <IconSymbol 
                                        name={isQuick ? "star" : "star.fill"} 
                                        size={14} 
                                        color={isQuick ? "#fff" : colors.activeCard} 
                                    />
                                    <Text style={[
                                        styles.quickAddText, 
                                        { color: isQuick ? "#fff" : colors.activeCard }
                                    ]}>
                                        {isQuick ? "Quick Destination" : "Set as Quick Destination"}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })
                )}

                <TouchableOpacity 
                    style={[styles.addButton, { borderColor: colors.activeCard }]}
                    onPress={() => router.push({
                        pathname: '/map-select',
                        params: { fromSavedPlaces: 'true' }
                    })}
                >
                    <IconSymbol name="plus" size={20} color={colors.activeCard} />
                    <Text style={[styles.addButtonText, { color: colors.activeCard }]}>
                        Add New Place
                    </Text>
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}   

const styles = StyleSheet.create({
    container: { 
        flex: 1 
    },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        paddingHorizontal: 15, 
        paddingTop: 40, 
        paddingBottom: 10 
    },
    backBtn: { 
        width: 40, 
        height: 40, 
        justifyContent: 'center' 
    },
    headerTitle: { 
        fontSize: 22, 
        fontWeight: 'bold' 
    },
    scrollContent: { 
        paddingHorizontal: 20, 
        paddingBottom: 40 
    },
    searchSection: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 15, 
        height: 52, 
        borderRadius: 15, 
        borderWidth: 1.5, 
        marginBottom: 25, 
        marginTop: 10 
    },
    searchInput: { 
        flex: 1, 
        marginLeft: 10, 
        fontSize: 16 },
    emptyText: { 
        textAlign: 'center', 
        marginTop: 40, 
        fontSize: 16 
    },
    addButton: { 
        borderWidth: 2, 
        borderStyle: 'dashed', 
        borderRadius: 20, 
        height: 70, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: 10, 
        marginTop: 10 
    },
    addButtonText: { 
        fontSize: 18, 
        fontWeight: '600' 
    },
    cardWrapper: {
        marginBottom: 20,
        backgroundColor: 'transparent',
    },
    quickAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderBottomLeftRadius: 15,
        borderBottomRightRadius: 15,
        marginTop: -10, 
        gap: 6,
        alignSelf: 'flex-start',
        marginLeft: 10,
    },
    quickAddText: {
        fontSize: 12,
        fontWeight: 'bold',
    }
});