import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { Colors } from '@/constants/color';
import { useMapContext } from '@/context/map-context';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

export default function RecentSearchesScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const { recentSearches, favorites, toggleFavorite, clearRecentSearches } = useMapContext();
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');
    const [showConfirm, setShowConfirm] = useState(false); 

    const sortedSearches = [...recentSearches].reverse();
    const displayList = filter === 'favorites' 
        ? sortedSearches.filter(item => favorites.includes(item.name))
        : sortedSearches;

    const handleClearConfirm = () => {
        clearRecentSearches();
        setShowConfirm(false);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <IconSymbol name="chevron.left" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    Recent Searches
                </Text>
                
                <TouchableOpacity onPress={() => setShowConfirm(true)}>
                    <Text style={[styles.clearText, { color: colors.modalSave }]}>
                        Clear All
                    </Text>
                </TouchableOpacity>
            </View>

            <Modal transparent visible={showConfirm} animationType="fade">
                <ModalContainer>
                    <View style={styles.modalContent}>
                        <View style={[styles.warningIcon, { backgroundColor: colors.modalSave + '20' }]}>
                            <IconSymbol name="trash.fill" size={30} color={colors.modalIcon} />
                        </View>
                        
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Are you sure?</Text>
                        <Text style={[styles.modalSubtitle, { color: colors.subtitle }]}>
                            This will remove all recent searches except for your favorites.
                        </Text>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity 
                                style={[styles.cancelBtn, { borderColor: colors.modalThanks }]} 
                                onPress={() => setShowConfirm(false)}
                            >
                                <Text style={{ color: colors.text, fontWeight: '600' }}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                                style={[styles.confirmBtn, { backgroundColor: colors.modalSave }]} 
                                onPress={handleClearConfirm}
                            >
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>
                                    Clear All
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ModalContainer>
            </Modal>

            <View style={styles.filterRow}>
                <TouchableOpacity 
                    onPress={() => setFilter('all')}
                    style={[styles.filterTab, filter === 'all' && { borderBottomColor: colors.modalSave }]}
                >
                    <Text style={[styles.filterText, { color: filter === 'all' ? colors.text : colors.subtitle }]}>
                        All
                    </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    onPress={() => setFilter('favorites')}
                    style={[styles.filterTab, filter === 'favorites' && { borderBottomColor: colors.modalSave }]}
                >
                    <Text style={[styles.filterText, { color: filter === 'favorites' ? colors.text : colors.subtitle }]}>
                        Favorites
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {displayList.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: colors.subtitle, marginTop: 40 }}>
                        {filter === 'favorites' ? "No favorites yet" : "No recent searches"}
                    </Text>
                ) : (
                    displayList.map((item, index) => (
                        <View key={item.id}>
                            <View style={styles.recentItemRow}> 
                                <View style={[styles.clockCircle, { backgroundColor: colors.eyeIcon }]}>
                                    <IconSymbol name="clock.fill" size={20} color={colors.background} />
                                </View>
                                
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.recentItemName, { color: colors.text }]}>{item.name}</Text>
                                    <Text style={[styles.recentItemCoords, { color: colors.subtitle }]}>
                                        Lat: {item.lat.toFixed(4)}° N, Lng: {item.lng.toFixed(4)}° E
                                    </Text>
                                </View>

                                <TouchableOpacity onPress={() => toggleFavorite(item.name)}>
                                    <IconSymbol 
                                        name={favorites.includes(item.name) ? "heart.fill" : "heart.outline"} 
                                        size={24} 
                                        color={favorites.includes(item.name) ? colors.locationMarker : colors.subtitle} 
                                    />
                                </TouchableOpacity>
                            </View>
                            {index < displayList.length - 1 && (
                                <View style={[styles.divider, { backgroundColor: colors.hr }]} />
                            )}
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        paddingTop: 50 
    },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 20,
        height: 30
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
    clearText: { 
        fontWeight: '600' 
    },
    filterRow: { 
        flexDirection: 'row', 
        paddingHorizontal: 20, 
        marginTop: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)'
    },
    filterTab: { 
        paddingVertical: 12, 
        marginRight: 25,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent'
    },
    filterText: { 
        fontSize: 15, 
        fontWeight: '600' 
    },
    scrollContent: { 
        paddingHorizontal: 20, 
        paddingBottom: 40 
    },
    recentItemRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 18 
    },
    clockCircle: { 
        width: 42, 
        height: 42, 
        borderRadius: 21, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginRight: 15 
    },
    recentItemName: { 
        fontSize: 16, 
        fontWeight: 'bold' 
    },
    recentItemCoords: { 
        fontSize: 13, 
        marginTop: 3 
    },
    divider: { 
        height: 1, 
        marginLeft: 57 
    },
    modalContent: {
        alignItems: 'center',
    },
    warningIcon: {
        width: 70,
        height: 70,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    modalSubtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 10,
        lineHeight: 20
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 15
    },
    cancelBtn: {
        flex: 1,
        height: 50,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1
    },
    confirmBtn: {
        flex: 1,
        height: 50,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    }
});