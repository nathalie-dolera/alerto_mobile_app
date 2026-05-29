import { IconSymbol } from "@/components/ui/icon-symbol";
import { MapTopBar } from "@/components/ui/map-top-bar";
import { Colors } from "@/constants/color";
import { useMapContext } from '@/context/map-context';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Alert, Animated, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableHighlight, TouchableOpacity, View, useColorScheme } from 'react-native';
import { PrimaryButton } from '../../components/ui/primary-button';
import {
    createRiskHeatmapShape,
    riskHeatmapCoreLayerStyle,
    riskHeatmapGlowLayerStyle,
    riskHeatmapHaloLayerStyle,
} from '../../utils/heatmap';
import { calculateDistance } from '../../utils/location';

const STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const BASE_MAP_URL = STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/osm_bright.json';
const DARK_MAP_URL = STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json';
MapLibreGL.setAccessToken(null);

const MIN_SHEET_HEIGHT = 220;
const MAX_SHEET_HEIGHT = 500;

function formatDistance(meters: number) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatEta(seconds: number) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}

function buildRouteShape(points: { lat: number; lng: number }[]) {
    return {
        type: 'FeatureCollection' as const,
        features: [
            {
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'LineString' as const,
                    coordinates: points.map(point => [point.lng, point.lat]),
                },
            },
        ],
    };
}

export default function MapSelectScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const mapStyle = theme === 'dark' ? DARK_MAP_URL : BASE_MAP_URL;
    const mapLogic = useMapContext();
    const { riskHeatmapPoints, activeRoute, routeRecognitionStatus } = mapLogic;
    const sheetHeight = useRef(new Animated.Value(MIN_SHEET_HEIGHT)).current;
    const [isExpanded, setIsExpanded] = useState(false);
    const [isTrackingMode, setIsTrackingMode] = useState(false);
    const params = useLocalSearchParams();
    
    const riskHeatmapShape = useMemo(
        () => createRiskHeatmapShape(riskHeatmapPoints), 
        [riskHeatmapPoints]
    );

    useEffect(() => {
        //search cleanup
        return () => {
            mapLogic.setSearchQuery("");
            mapLogic.setSuggestions([]);
        };
    }, []);

    useEffect(() => {
        if (!mapLogic.currentCoords) {
            return;
        }

        const distance = calculateDistance(
            mapLogic.currentCoords[1],
            mapLogic.currentCoords[0],
            mapLogic.region[1],
            mapLogic.region[0]
        );

        if (distance < 30) {
            if (mapLogic.activeRoute) {
                void mapLogic.refreshRoutePlan(null, true);
            }
            return;
        }

        void mapLogic.refreshRoutePlan({
            lat: mapLogic.region[1],
            lng: mapLogic.region[0],
        });
    }, [mapLogic.currentCoords, mapLogic.region]);

    const routeShape = useMemo(
        () => activeRoute?.points?.length ? buildRouteShape(activeRoute.points) : null,
        [activeRoute]
    );

    const trafficShapes = useMemo(() => {
        return activeRoute?.trafficSegments
            ?.filter(segment => segment.points.length >= 2)
            .map(segment => ({
                id: segment.id,
                color:
                    segment.severity === 'heavy'
                        ? '#dc2626'
                        : segment.severity === 'moderate'
                            ? '#f97316'
                            : '#eab308',
                shape: buildRouteShape(segment.points),
            })) ?? [];
    }, [activeRoute]);

    const directDistanceMeters = useMemo(() => {
        if (!mapLogic.currentCoords) {
            return null;
        }

        return calculateDistance(
            mapLogic.currentCoords[1],
            mapLogic.currentCoords[0],
            mapLogic.region[1],
            mapLogic.region[0]
        );
    }, [mapLogic.currentCoords, mapLogic.region]);

    const routeDistanceMeters = activeRoute?.distanceMeters ?? directDistanceMeters;
    const routeEtaSeconds = activeRoute?.travelTimeSeconds ?? (
        directDistanceMeters !== null ? Math.max(60, Math.round(directDistanceMeters / 8.33)) : null
    );
    const hasRoadRoute = Boolean(activeRoute);

    const handleSetDestination = () => {
        if (directDistanceMeters !== null) {
            if (directDistanceMeters < 30) {
                Alert.alert(
                    'Select a destination',
                    'This looks like your current location. Please choose a different destination before setting an alarm.'
                );
                return;
            }
        }

        router.push({
            pathname: '/alarm-config',
            params: {
                placeName: mapLogic.locationName,
                destLat: mapLogic.region[1].toString(),
                destLng: mapLogic.region[0].toString(),
                routeDistanceMeters: routeDistanceMeters?.toString(),
                routeEtaSeconds: routeEtaSeconds?.toString(),
                routeDistanceSource: hasRoadRoute ? 'route' : 'estimate',
                fromSavedPlaces: params.fromSavedPlaces
            }
        });
    };

    // for drag or swipe gesture
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy < -30) {
                    setIsExpanded(true);
                    Animated.spring(sheetHeight, {
                        toValue: MAX_SHEET_HEIGHT,
                        useNativeDriver: false
                    }).start();
                }
                else if (gestureState.dy > 30) {
                    setIsExpanded(false);
                    Animated.spring(sheetHeight, {
                        toValue: MIN_SHEET_HEIGHT,
                        useNativeDriver: false
                    }).start();
                }
            }
        })
    ).current;

    const handleMapPress = (event: any) => {
        setIsTrackingMode(false);
        const coords = event.geometry.coordinates as [number, number];
        mapLogic.setRegion(coords);
        mapLogic.reverseGeocode(coords);
        mapLogic.setSuggestions([]);
    };
    const handleRecentPress = (item: any) => {
        mapLogic.setRegion([item.lng, item.lat]);
        mapLogic.setLocationName(item.name);
        mapLogic.addToRecent(item.name, item.lat, item.lng);
        setIsExpanded(false);
        Animated.spring(sheetHeight, { toValue: MIN_SHEET_HEIGHT, useNativeDriver: false }).start();
    };

    const displayRecents = mapLogic.recentSearches.filter(item => item.name !== mapLogic.locationName).slice(0, 3);
    const shouldShowRouteStatus = routeRecognitionStatus !== 'Refreshed Route';
    
    const cameraCenter = isTrackingMode && mapLogic.currentCoords ? mapLogic.currentCoords : mapLogic.region;

    return (
        //map ui
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <MapLibreGL.MapView
                style={styles.map}
                mapStyle={mapStyle}
                logoEnabled={false}
                surfaceView={Platform.OS === 'android'}
                onPress={handleMapPress}>

                <MapLibreGL.UserLocation visible={true} showsUserHeadingIndicator={true} />

                <MapLibreGL.Camera
                    zoomLevel={mapLogic.zoomLevel}
                    centerCoordinate={cameraCenter}
                    animationMode="flyTo" />

                {routeShape && (
                    <MapLibreGL.ShapeSource id="selectedRouteSource" shape={routeShape}>
                        <MapLibreGL.LineLayer
                            id="selectedRouteLine"
                            style={{
                                lineColor: theme === 'dark' ? '#3b82f6' : colors.primaryIcon,
                                lineWidth: 5,
                                lineOpacity: 0.9,
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                )}

                {trafficShapes.map(segment => (
                    <MapLibreGL.ShapeSource key={segment.id} id={segment.id} shape={segment.shape}>
                        <MapLibreGL.LineLayer
                            id={`${segment.id}-line`}
                            style={{
                                lineColor: segment.color,
                                lineWidth: 7,
                                lineOpacity: 0.95,
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                ))}

                {riskHeatmapPoints.length > 0 && (
                    <MapLibreGL.ShapeSource
                        id="riskHeatmapSource"
                        shape={riskHeatmapShape}
                    >
                        <MapLibreGL.CircleLayer
                            id="riskHeatmapHalo"
                            sourceID="riskHeatmapSource"
                            style={riskHeatmapHaloLayerStyle}
                        />
                        <MapLibreGL.CircleLayer
                            id="riskHeatmapGlow"
                            sourceID="riskHeatmapSource"
                            style={riskHeatmapGlowLayerStyle}
                        />
                        <MapLibreGL.CircleLayer
                            id="riskHeatmapCore"
                            sourceID="riskHeatmapSource"
                            style={riskHeatmapCoreLayerStyle}
                        />
                    </MapLibreGL.ShapeSource>
                )}

                {/*map marker*/}
                <MapLibreGL.PointAnnotation
                    id="marker"
                    coordinate={mapLogic.region}
                    draggable onDragEnd={handleMapPress}
                    anchor={{ x: 0.5, y: 1 }}>
                    <View style={styles.markerContainer} collapsable={false}>
                        <IconSymbol name="location-sharp" size={45} color={colors.locationMarker} />
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

            {riskHeatmapPoints.length > 0 && mapLogic.suggestions.length === 0 && (
                <View style={[styles.heatmapLegend, { backgroundColor: colors.background }]}>
                    <Text style={[styles.heatmapLegendTitle, { color: colors.text }]}>
                        Risk Heatmap
                    </Text>
                    <Text style={[styles.heatmapLegendSubtitle, { color: colors.subtitle }]}>
                        Areas with frequent alerts and reported incidents
                    </Text>
                    <View style={styles.heatmapLegendScale}>
                        <View style={[styles.legendDot, { backgroundColor: '#84cc16' }]} />
                        <Text style={[styles.legendText, { color: colors.text }]}>Lower density</Text>
                        <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
                        <Text style={[styles.legendText, { color: colors.text }]}>Moderate</Text>
                        <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
                        <Text style={[styles.legendText, { color: colors.text }]}>Higher density</Text>
                    </View>
                </View>
            )}

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
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.locationTitle, { color: colors.text }]} numberOfLines={1}>
                            {mapLogic.locationName}
                        </Text>
                        <Text style={[styles.coordinatesText, { color: colors.subtitle }]}>
                            Lat: {mapLogic.region[1].toFixed(4)}° N, Lng: {mapLogic.region[0].toFixed(4)}° E
                        </Text>
                        {routeDistanceMeters !== null && routeEtaSeconds !== null && (
                            <Text style={[styles.routeSummaryText, { color: colors.primaryIcon }]}>
                                {hasRoadRoute ? 'Route' : 'Estimated'}: {formatDistance(routeDistanceMeters)} • ETA {formatEta(routeEtaSeconds)}
                            </Text>
                        )}
                        {shouldShowRouteStatus && (
                            <Text
                                style={[
                                    styles.routeStateText,
                                    { color: routeRecognitionStatus === 'Unrecognized Route' ? colors.locationMarker : colors.subtitle }
                                ]}
                            >
                                {routeRecognitionStatus}
                            </Text>
                        )}
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
                        <TouchableOpacity onPress={() => router.push('/(main)/recent-searches')}>
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

                {params.mode !== 'view' ? (
                    <PrimaryButton
                        style={{ marginTop: 10 }}
                        onPress={handleSetDestination}>
                        Set Destination
                    </PrimaryButton>
                ) : (
                    <PrimaryButton
                        style={{ marginTop: 10 }}
                        onPress={() => {
                            setIsTrackingMode(true);
                            Animated.spring(sheetHeight, {
                                toValue: MIN_SHEET_HEIGHT,
                                useNativeDriver: false
                            }).start();
                            setIsExpanded(false);
                        }}>
                        Track Destination
                    </PrimaryButton>
                )}
            </Animated.View>

        </View>
    );
}

const styles = StyleSheet.create({
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
    heatmapLegend: {
        position: 'absolute',
        left: 78,
        right: 20,
        top: 112,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 8,
        elevation: 4,
    },
    heatmapLegendTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    heatmapLegendSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    heatmapLegendScale: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 4,
        flexWrap: 'wrap',
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 12,
        fontWeight: '600',
        marginRight: 6,
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
    routeSummaryText: {
        fontSize: 13,
        marginTop: 6,
        fontWeight: '700'
    },
    routeStateText: {
        fontSize: 12,
        marginTop: 4,
        fontWeight: '600'
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
        marginTop: 10,
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
