import { IconSymbol } from "@/components/ui/icon-symbol";
import { MapTopBar } from "@/components/ui/map-top-bar";
import { Colors } from "@/constants/color";
import { useMapSelect } from "@/hooks/use-map-select";
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useRouter } from "expo-router";
import React, { useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, Text, TouchableHighlight, TouchableOpacity, View, useColorScheme } from 'react-native';
import { PrimaryButton } from '../../components/ui/primary-button';

const STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const MAP_STYLE = `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${STADIA_KEY}`;
MapLibreGL.setAccessToken(null);

const MIN_SHEET_HEIGHT = 220;
const MAX_SHEET_HEIGHT = 500;

export default function MapSelectScreen () {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const mapLogic = useMapSelect();
    const sheetHeight = useRef(new Animated.Value(MIN_SHEET_HEIGHT)).current;
    const [isExpanded, setIsExpanded] = useState(false);

      // for drag or swipe gesture
    const panResponder = useRef(
        PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy < -30) {
            setIsExpanded(true);
            Animated.spring(sheetHeight, { 
                toValue: MAX_SHEET_HEIGHT, 
                useNativeDriver: false }).start();
            } 
            else if (gestureState.dy > 30) {
            setIsExpanded(false);
            Animated.spring(sheetHeight, { 
                toValue: MIN_SHEET_HEIGHT, 
                useNativeDriver: false }).start();
            }
        }
        })
    ).current;

    const handleMapPress = (event: any) => {
        const coords = event.geometry.coordinates as [number, number];
        mapLogic.setRegion(coords);
        mapLogic.reverseGeocode(coords) 
    };
    const handleRecentPress = (item: any) => {
        mapLogic.setRegion([item.lng, item.lat]);
        mapLogic.setLocationName(item.name);
        mapLogic.addToRecent(item.name, item.lat, item.lng); 
        setIsExpanded(false);
        Animated.spring(sheetHeight, { toValue: MIN_SHEET_HEIGHT, useNativeDriver: false }).start();
    };

    const displayRecents = mapLogic.recentSearches.filter(item => item.name !== mapLogic.locationName).slice(0, 3);

    return (
        //map ui
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <MapLibreGL.MapView 
            style = {styles.map}
            mapStyle = {MAP_STYLE}
            logoEnabled = {false}
            onPress = {handleMapPress}>

            <MapLibreGL.Camera
            zoomLevel = {mapLogic.zoomLevel}
            centerCoordinate={mapLogic.region}
            animationMode="flyTo"/>

        {/*map marker*/}
            <MapLibreGL.PointAnnotation 
            id = "marker" 
            coordinate={mapLogic.region} 
            draggable onDragEnd={handleMapPress}
            anchor={{ x: 0.5, y: 1 }}>
                <View style={styles.markerContainer}>
                    <IconSymbol name="location-sharp" size={45} color={colors.locationMarker}/>
                </View>
            </MapLibreGL.PointAnnotation>
            </MapLibreGL.MapView>

            <MapTopBar
            onBack={() => router.back()} 
            searchQuery={mapLogic.searchQuery} 
            setSearchQuery={mapLogic.setSearchQuery} 
            onSearch={mapLogic.handleSearch} 
            colors={colors} 
            />

            {/*zoom and auto locate */}
            <View style={[styles.mapControls, { bottom: isExpanded ? 520 : 240 }]}>
                <View style={[styles.zoomControlsContainer, { backgroundColor: colors.background }]}>
                    <TouchableOpacity 
                        style={styles.controlBtn} 
                        onPress={() => mapLogic.setZoomLevel(z => Math.min(z + 1, 20))}
                    >
                        <IconSymbol name="add" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View style={[styles.controlDivider, { backgroundColor: colors.hr }]} />

                    <TouchableOpacity 
                        style={styles.controlBtn} 
                        onPress={() => mapLogic.setZoomLevel(z => Math.max(z - 1, 2))}
                    >
                        <IconSymbol name="remove" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    style={[styles.locateBtn, { backgroundColor: colors.background, marginTop: 12 }]} 
                    onPress={mapLogic.handleLocateMe}
                >
                    <IconSymbol name="locate" size={24} color={colors.primaryIcon} />
                </TouchableOpacity>
            </View>

            <Animated.View style={[styles.bottomSheet, { height: sheetHeight, backgroundColor: colors.background }]}>
    
                {/* for swipping like down or up */}
                <View {...panResponder.panHandlers} style={styles.dragArea}>
                    <View style={[styles.dragIndicator, { backgroundColor: colors.hr }]} />
                </View>
                
                {/* selected info */}
                <View style={styles.locationInfoRow}>
                    <View style={{flex: 1, paddingRight: 10}}>
                        <Text style={[styles.locationTitle, { color: colors.text }]} numberOfLines={1}>
                            {mapLogic.locationName}
                        </Text>
                        <Text style={[styles.coordinatesText, { color: colors.subtitle }]}>
                            Lat: {mapLogic.region[1].toFixed(4)}° N, Lng: {mapLogic.region[0].toFixed(4)}° E
                        </Text>
                    </View>
                    
                    <TouchableOpacity 
                        style={[styles.heartButton, { backgroundColor: theme === 'dark' ? '#3b1c1c' : '#FFF5F5' }]} 
                        onPress={() => mapLogic.toggleFavorite(mapLogic.locationName)}
                    >
                        <IconSymbol 
                            name={mapLogic.favorites.includes(mapLogic.locationName) ? "heart.fill" : "heart.outline"} 
                            size={24} 
                            color={colors.locationMarker} 
                        />
                    </TouchableOpacity>
                </View>

                {/* for recent search */}
                <View style={{ flex: 1, overflow: 'hidden' }}>
                    <View style={styles.recentHeaderRow}>
                        <Text style={[styles.recentHeaderTitle, { color: colors.text }]}>RECENT SEARCHES</Text>
                        <TouchableOpacity>
                            <Text style={[styles.clearAllText, { color: colors.containerText }]}>See All</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {displayRecents.length === 0 ? (
                            <Text style={{ textAlign: 'center', color: colors.subtitle, marginTop: 10 }}>
                                No other recent searches
                            </Text>
                        ) : (
                            displayRecents.map((item, index) => ( 
                                <View key={item.id}>
                                    <TouchableHighlight 
                                        style={styles.recentItemWrapper} 
                                        underlayColor={colors.hr} 
                                        onPress={() => handleRecentPress(item)}
                                    >
                                        <View style={styles.recentItemRow}> 
                                            <View style={[styles.clockCircle, { backgroundColor: colors.eyeIcon }]}>
                                                <IconSymbol name="clock.outline" size={20} color={colors.background} />
                                            </View>
                                            
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.recentItemName, { color: colors.text }]}>
                                                    {item.name}
                                                </Text>
                                                <Text style={[styles.recentItemCoords, { color: colors.subtitle }]}>
                                                    Lat: {item.lat.toFixed(4)}° N, Lng: {item.lng.toFixed(4)}° E
                                                </Text>
                                            </View>

                                            <TouchableOpacity onPress={() => mapLogic.toggleFavorite(item.name)}>
                                                <IconSymbol 
                                                    name={mapLogic.favorites.includes(item.name) ? "heart.fill" : "heart.outline"} 
                                                    size={24} 
                                                    color={mapLogic.favorites.includes(item.name) ? colors.locationMarker : colors.icon} 
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    </TouchableHighlight>
                                    
                                    {index < displayRecents.length - 1 && (
                                        <View style={[styles.divider, { backgroundColor: colors.hr }]} />
                                    )}
                                </View>
                            )) 
                        )}
                    </ScrollView>
                </View>

                <PrimaryButton 
                    style={{ marginTop: 10 }} 
                    onPress={() => {}}>
                    Set Destination
                </PrimaryButton>
            </Animated.View>

        </View>
    );
}

const styles = StyleSheet.create ({
    map: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    markerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -50
    },
    mapControls: {
        position: 'absolute',
        right: 20, 
        alignItems: 'center',
        gap: 15,
    },
    zoomControlsContainer: {
        borderRadius: 12,
        width: 44,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 5,
    },
    controlBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center'
    },
    controlDivider: {
        height: 1,
        marginHorizontal: 8,
    },
    locateBtn: {
        borderRadius: 12,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 5,
        marginTop: 5,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomSheet: { 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        borderTopLeftRadius: 30, 
        borderTopRightRadius: 30, 
        paddingHorizontal: 25, 
        paddingBottom: 25, 
        elevation: 20, 
        shadowColor: '#000', 
        shadowOpacity: 0.2, 
        shadowRadius: 10 
    },
    dragArea: {
        width: '100%', 
        height: 30, 
        alignItems: 'center', 
        justifyContent: 'center' 
    },
    dragIndicator: {
        width: 50,
        height: 5,
        borderRadius: 5
    },
    locationInfoRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 15 
    },
    locationTitle: { 
        fontSize: 22, 
        fontWeight: 'bold' 
    },
    coordinatesText: { 
        fontSize: 14,
        marginTop: 4 
    },
    heartButton: { 
        padding: 10,
        borderRadius: 50 
    },
    recentHeaderRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginTop: 18, 
        marginBottom: 15 
    },
    recentHeaderTitle: {
        fontSize: 16,
        marginTop: 12, 
        fontWeight: '900' 
    },
    clearAllText: { 
        fontSize: 14 
    },
    recentItemWrapper: {
        borderRadius: 12,
        marginHorizontal: -10,
        paddingHorizontal: 10 
    },
    recentItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12 
    },
    clockCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
        marginTop: 2
    },
    divider: {
        height: 1,
        marginLeft: 55 
    },
})