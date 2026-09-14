import { IconSymbol } from "@/components/ui/icon-symbol";
import { MapTopBar } from "@/components/ui/map-top-bar";
import { Colors } from "@/constants/color";
import { useAuth } from '@/context/auth';
import { useMapContext } from '@/context/map-context';
import { DriverStopModal } from '@/components/alerts/driver-stop-modal';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { fetchNearbyPOIs, NearbyPOI, POI_CATEGORY_ICONS, POI_CATEGORY_COLORS } from '@/services/nearby-poi';
import { RouteOption } from '@/services/routes';
import { ActivityIndicator, Alert, Animated, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableHighlight, TouchableOpacity, View, useColorScheme } from 'react-native';
import { PrimaryButton } from '../../components/ui/primary-button';
import {
    createRiskHeatmapShape,
    riskHeatmapLayerStyle,
} from '../../utils/heatmap';
import { calculateDistance } from '../../utils/location';
import { isWithinPhilippinesBounds, PHILIPPINES_CAMERA_BOUNDS, PHILIPPINES_CENTER } from '../../utils/philippines';

const BASE_MAP_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_MAP_URL = 'https://tiles.openfreemap.org/styles/dark';
MapLibreGL.setAccessToken(null);

const MAX_SHEET_HEIGHT = 500;

function formatDistance(meters: number) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatEta(seconds: number) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}

function buildRouteShape(points: { lat: number; lng: number }[]) {
    const validPoints = (points || []).filter(
        point => point && typeof point.lat === 'number' && typeof point.lng === 'number' && !isNaN(point.lat) && !isNaN(point.lng)
    );
    return {
        type: 'FeatureCollection' as const,
        features: [
            {
                type: 'Feature' as const,
                properties: {},
                geometry: {
                    type: 'LineString' as const,
                    coordinates: validPoints.map(point => [point.lng, point.lat]),
                },
            },
        ],
    };
}

import { useSavedPlacesContext } from '@/context/saved-places';

export default function MapSelectScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    // Memoize mapStyle so MapLibre never sees a new URL string on unrelated renders
    // (a new string reference causes it to re-download all tiles and flash)
    const mapStyle = useMemo(
        () => (theme === 'dark' ? DARK_MAP_URL : BASE_MAP_URL),
        [theme]
    );

    const mapLogic = useMapContext();
    const { riskHeatmapPoints, activeRoute, routeRecognitionStatus, startAlarm } = mapLogic;
    const { savedPlaces } = useSavedPlacesContext();
    const { user } = useAuth();
    const minHeight = 220;
    const sheetHeight = useRef(new Animated.Value(minHeight)).current;
    const cameraRef = useRef<MapLibreGL.CameraRef>(null);
    const currentZoomRef = useRef<number>(15);

    const [isExpanded, setIsExpanded] = useState(false);
    const [isUserPanning, setIsUserPanning] = useState(false);
    const [isUserZooming, setIsUserZooming] = useState(false);
    const [isTrackingMode, setIsTrackingMode] = useState(false);
    const [isStopModalVisible, setIsStopModalVisible] = useState(false);
    const [isHeatmapExpanded, setIsHeatmapExpanded] = useState(false);
    const params = useLocalSearchParams();
    const [nearbyPOIs, setNearbyPOIs] = useState<NearbyPOI[]>([]);
    const poiFetchRef = useRef<string>('');
    // Alternative route selected by the user (replaces primary for ETA/distance display)
    const [selectedAltRoute, setSelectedAltRoute] = useState<RouteOption | null>(null);
    const hasDestinationSet = Boolean(activeRoute);

    const safeRegion: [number, number] = useMemo(() => {
        if (
            Array.isArray(mapLogic.region) &&
            typeof mapLogic.region[0] === 'number' &&
            typeof mapLogic.region[1] === 'number' &&
            !isNaN(mapLogic.region[0]) &&
            !isNaN(mapLogic.region[1])
        ) {
            return mapLogic.region;
        }
        return PHILIPPINES_CENTER;
    }, [mapLogic.region]);
    
    const riskHeatmapShape = useMemo(() => {
        if (!riskHeatmapPoints || riskHeatmapPoints.length === 0) {
          return { type: 'FeatureCollection' as const, features: [] as any[] };
        }
        return createRiskHeatmapShape(riskHeatmapPoints);
      }, [riskHeatmapPoints]);

    // Fetch nearby POIs when map region changes (debounced)
    useEffect(() => {
        const lat = safeRegion[1];
        const lng = safeRegion[0];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const regionKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;

        // Skip if we already fetched for this region
        if (poiFetchRef.current === regionKey) return;

        const timer = setTimeout(async () => {
            poiFetchRef.current = regionKey;
            try {
                const pois = await fetchNearbyPOIs(lat, lng, 2);
                setNearbyPOIs(pois || []);
            } catch (e) {
                console.warn('POI fetch error:', e);
            }
        }, 800); // 800ms debounce to avoid spamming API on every drag

        return () => clearTimeout(timer);
    }, [safeRegion]);

    useEffect(() => {
        //search cleanup
        return () => {
            mapLogic.setSearchQuery("");
            mapLogic.setSuggestions([]);
        };
    }, []);

    // Support pre-selecting location when opened from Device Tracker or external link
    useEffect(() => {
        if (params.destLat && params.destLng) {
            const lat = parseFloat(params.destLat as string);
            const lng = parseFloat(params.destLng as string);
            if (!isNaN(lat) && !isNaN(lng)) {
                mapLogic.setRegion([lng, lat]);
                if (params.placeName) {
                    mapLogic.setLocationName(params.placeName as string);
                } else {
                    void mapLogic.reverseGeocode([lng, lat]);
                }
                void mapLogic.refreshRoutePlan({ lat, lng });
            }
        }
    }, [params.destLat, params.destLng, params.placeName]);

    // 120ms debounce on region panning to prevent spamming routing APIs while user drags
    const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!mapLogic.currentCoords || !Number.isFinite(mapLogic.currentCoords[0]) || !Number.isFinite(mapLogic.currentCoords[1])) {
            return;
        }

        const [regLng, regLat] = safeRegion;
        const distance = calculateDistance(
            mapLogic.currentCoords[1],
            mapLogic.currentCoords[0],
            regLat,
            regLng
        );

        if (distance < 30) {
            if (mapLogic.activeRoute) {
                void mapLogic.refreshRoutePlan(null, true);
            }
            return;
        }

        if (routeTimerRef.current) {
            clearTimeout(routeTimerRef.current);
        }

        routeTimerRef.current = setTimeout(() => {
            void mapLogic.refreshRoutePlan({
                lat: regLat,
                lng: regLng,
            });
        }, 120);

        return () => {
            if (routeTimerRef.current) {
                clearTimeout(routeTimerRef.current);
            }
        };
    }, [mapLogic.currentCoords, safeRegion]);

    // When a new activeRoute arrives, reset alternative selection and camera lock
    useEffect(() => {
        setSelectedAltRoute(null);
        setIsUserPanning(false);
        setIsUserZooming(false);
    }, [activeRoute]);

    const effectiveRoute = selectedAltRoute
        ? { points: selectedAltRoute.points, distanceMeters: selectedAltRoute.distanceMeters, travelTimeSeconds: selectedAltRoute.travelTimeSeconds }
        : activeRoute;

    const routeShape = useMemo(
        () => effectiveRoute?.points?.length ? buildRouteShape(effectiveRoute.points) : null,
        [effectiveRoute]
    );

    const secondaryRouteShapes = useMemo(() => {
        if (!activeRoute) return [];

        const routes = [
            ...(selectedAltRoute
                ? [{
                    id: 'planned-route',
                    label: 'Planned Route',
                    points: activeRoute.points,
                    distanceMeters: activeRoute.distanceMeters,
                    travelTimeSeconds: activeRoute.travelTimeSeconds,
                    alt: null,
                }]
                : []),
            ...(activeRoute.alternatives ?? [])
                .filter(alt => alt.id !== selectedAltRoute?.id)
                .map(alt => ({
                    id: alt.id,
                    label: alt.label,
                    points: alt.points,
                    distanceMeters: alt.distanceMeters,
                    travelTimeSeconds: alt.travelTimeSeconds,
                    alt,
                })),
        ];

        return routes.map(route => ({
            id: route.id,
            label: route.label,
            shape: buildRouteShape(route.points),
            alt: route.alt,
        }));
    }, [activeRoute, selectedAltRoute]);

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

    // Use road route distance when available, else a route estimate.
    const routeDistanceMeters = effectiveRoute?.distanceMeters ?? directDistanceMeters;
    // Use road route ETA when available; fall back to commute-monitor's same urban traffic formula
    const routeEtaSeconds = effectiveRoute?.travelTimeSeconds ?? (
        directDistanceMeters !== null ? Math.max(120, Math.round((directDistanceMeters / 4.2) * 1.65) + 180) : null
    );
    const hasRoadRoute = Boolean(activeRoute);

    // Compute route bounds to automatically frame the entire route on the map
    const routeBounds = useMemo(() => {
        if (isUserPanning || isUserZooming || !effectiveRoute?.points || effectiveRoute.points.length < 2) {
            return undefined;
        }
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        let count = 0;
        effectiveRoute.points.forEach(p => {
            if (p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)) {
                if (p.lat < minLat) minLat = p.lat;
                if (p.lat > maxLat) maxLat = p.lat;
                if (p.lng < minLng) minLng = p.lng;
                if (p.lng > maxLng) maxLng = p.lng;
                count++;
            }
        });
        if (count < 2 || maxLat <= minLat || maxLng <= minLng) {
            return undefined;
        }
        if (mapLogic.currentCoords && Number.isFinite(mapLogic.currentCoords[0]) && Number.isFinite(mapLogic.currentCoords[1])) {
            const cLat = mapLogic.currentCoords[1];
            const cLng = mapLogic.currentCoords[0];
            if (cLat < minLat) minLat = cLat;
            if (cLat > maxLat) maxLat = cLat;
            if (cLng < minLng) minLng = cLng;
            if (cLng > maxLng) maxLng = cLng;
        }
        return {
            ne: [maxLng, maxLat] as [number, number],
            sw: [minLng, minLat] as [number, number],
            paddingTop: 80,
            paddingBottom: isExpanded ? 520 : 290,
            paddingLeft: 40,
            paddingRight: 40,
        };
    }, [effectiveRoute, isUserPanning, isExpanded, mapLogic.currentCoords]);

    const originDisplayName = mapLogic.currentCoords
        ? 'Current Location'
        : 'Your Location';

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

        if (selectedAltRoute) {
            mapLogic.selectRouteOption(selectedAltRoute);
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
                        toValue: minHeight,
                        useNativeDriver: false
                    }).start();
                }
            }
        })
    ).current;

    const handleMapPress = (event: any) => {
        setIsTrackingMode(false);
        const coords = event.geometry.coordinates as [number, number];
        if (!isWithinPhilippinesBounds(coords)) {
            Alert.alert('Philippines Only', 'Please choose a location within the Philippines.');
            return;
        }

        if (routeTimerRef.current) {
            clearTimeout(routeTimerRef.current);
        }

        mapLogic.setRegion(coords);
        mapLogic.reverseGeocode(coords);
        mapLogic.setSuggestions([]);

        // Instant live route refresh on explicit map click or pin move
        void mapLogic.refreshRoutePlan({
            lat: coords[1],
            lng: coords[0],
        });
    };
    const handleRecentPress = (item: any) => {
        setIsUserPanning(false);
        setIsUserZooming(false);
        if (!isWithinPhilippinesBounds([item.lng, item.lat])) {
            Alert.alert('Philippines Only', 'Please choose a location within the Philippines.');
            return;
        }

        if (routeTimerRef.current) {
            clearTimeout(routeTimerRef.current);
        }

        mapLogic.setRegion([item.lng, item.lat]);
        mapLogic.setLocationName(item.name);
        mapLogic.addToRecent(item.name, item.lat, item.lng);
        setIsExpanded(false);
        Animated.spring(sheetHeight, { toValue: minHeight, useNativeDriver: false }).start();
        void mapLogic.refreshRoutePlan({ lat: item.lat, lng: item.lng });
    };

    const displayRecents = mapLogic.recentSearches.filter(item => item.name !== mapLogic.locationName).slice(0, 3);
    const shouldShowRouteStatus = routeRecognitionStatus !== 'Refreshed Route';
    
    const cameraCenter = isUserPanning
        ? undefined
        : (isTrackingMode && mapLogic.currentCoords ? mapLogic.currentCoords : safeRegion);

    return (
        //map ui
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <MapLibreGL.MapView
                style={styles.map}
                mapStyle={mapStyle}
                logoEnabled={false}
                attributionEnabled={false}
                compassEnabled={false}
                surfaceView={true}
                zoomEnabled={true}
                scrollEnabled={true}
                pitchEnabled={false}
                rotateEnabled={false}
                onRegionWillChange={(feature: any) => {
                    if (feature?.properties?.isGesture) {
                        setIsUserPanning(true);
                        setIsUserZooming(true);
                    }
                }}
                onRegionDidChange={(feature: any) => {
                    if (feature?.properties?.zoomLevel) {
                        // Track zoom level imperatively – do NOT feed back into state
                        // (state -> Camera prop fight is what causes the "two faces" blink)
                        currentZoomRef.current = feature.properties.zoomLevel;
                    }
                }}
                onPress={(event) => {
                    setIsUserPanning(false);
                    handleMapPress(event);
                }}>

                {mapLogic.currentCoords && Number.isFinite(mapLogic.currentCoords[0]) && Number.isFinite(mapLogic.currentCoords[1]) && (
                    <MapLibreGL.PointAnnotation
                        id="user-current-location"
                        coordinate={mapLogic.currentCoords}
                        anchor={{ x: 0.5, y: 0.5 }}
                    >
                        <View style={styles.userLocationDot} collapsable={false}>
                            <View style={styles.userLocationDotInner} />
                        </View>
                    </MapLibreGL.PointAnnotation>
                )}

                <MapLibreGL.Camera
                    ref={cameraRef}
                    defaultSettings={{
                        zoomLevel: 15,
                        centerCoordinate: safeRegion,
                    }}
                    centerCoordinate={routeBounds ? undefined : (cameraCenter || safeRegion)}
                    bounds={routeBounds}
                    animationMode="moveTo"
                    maxBounds={PHILIPPINES_CAMERA_BOUNDS} />

                {/* Other route options stay visible behind the selected route */}
                {secondaryRouteShapes.map((altShape, idx) => (
                    <MapLibreGL.ShapeSource
                        key={`alt-source-${altShape.id || idx}`}
                        id={`alt-source-${altShape.id || idx}`}
                        shape={altShape.shape}
                        onPress={() => setSelectedAltRoute(altShape.alt)}
                    >
                        <MapLibreGL.LineLayer
                            id={`alt-line-casing-${altShape.id || idx}`}
                            style={{
                                lineColor: theme === 'dark' ? '#64748b' : '#e2e8f0',
                                lineWidth: 10,
                                lineOpacity: 0.65,
                            }}
                        />
                        <MapLibreGL.LineLayer
                            id={`alt-line-${altShape.id || idx}`}
                            style={{
                                lineColor: theme === 'dark' ? '#cbd5e1' : '#94a3b8',
                                lineWidth: 6,
                                lineOpacity: 0.75,
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                ))}

                {/* Primary / selected route — bold blue with gray casing */}
                {routeShape && (
                    <MapLibreGL.ShapeSource id="selectedRouteSource" shape={routeShape}>
                        <MapLibreGL.LineLayer
                            id="selectedRouteLineCasing"
                            style={{
                                lineColor: theme === 'dark' ? '#475569' : '#94a3b8',
                                lineWidth: 10,
                                lineOpacity: 0.7,
                            }}
                        />
                        <MapLibreGL.LineLayer
                            id="selectedRouteLine"
                            style={{
                                lineColor: theme === 'dark' ? '#3b82f6' : colors.primaryIcon,
                                lineWidth: 6,
                                lineOpacity: 0.95,
                            }}
                        />
                    </MapLibreGL.ShapeSource>
                )}

                {/* Alternative route ETA badges (tappable labels) */}
                {secondaryRouteShapes.map((altShape, idx) => {
                    const routePoints = altShape.shape.features[0]?.geometry.coordinates ?? [];
                    const midIdx = Math.floor(routePoints.length / 2);
                    const midPt = routePoints[midIdx];
                    if (!midPt || typeof midPt[0] !== 'number' || typeof midPt[1] !== 'number' || isNaN(midPt[0]) || isNaN(midPt[1])) return null;
                    return (
                        <MapLibreGL.PointAnnotation
                            key={`alt-badge-${altShape.id || idx}`}
                            id={`alt-badge-${altShape.id || idx}`}
                            coordinate={midPt as [number, number]}
                            anchor={{ x: 0.5, y: 0.5 }}
                            onSelected={() => altShape.alt && setSelectedAltRoute(altShape.alt)}
                        >
                            <View
                                style={styles.altBadge}
                                collapsable={false}
                            >
                                <Text style={styles.altBadgeText}>{altShape.label}</Text>
                            </View>
                        </MapLibreGL.PointAnnotation>
                    );
                })}

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

                {riskHeatmapShape && riskHeatmapShape.features.length > 0 && (
                    <MapLibreGL.ShapeSource
                        id="riskHeatmapSource"
                        shape={riskHeatmapShape as any}
                    >
                        <MapLibreGL.CircleLayer
                            id="riskHeatmapLayer"
                            style={riskHeatmapLayerStyle}
                        />
                    </MapLibreGL.ShapeSource>
                )}

                {/* Render nearby POIs (shops, restaurants, gas stations, etc.) */}
                {nearbyPOIs.filter(poi => (
                    poi &&
                    typeof poi.lng === 'number' && !isNaN(poi.lng) &&
                    typeof poi.lat === 'number' && !isNaN(poi.lat)
                )).map((poi, idx) => (
                    <MapLibreGL.PointAnnotation
                        key={`poi-${poi.id || idx}`}
                        id={`poi-${poi.id || idx}`}
                        coordinate={[poi.lng, poi.lat]}
                        onSelected={() => {
                            mapLogic.setRegion([poi.lng, poi.lat]);
                            mapLogic.setLocationName(poi.name);
                        }}
                        anchor={{ x: 0.5, y: 1 }}
                    >
                        <View style={[styles.poiMarker, { backgroundColor: POI_CATEGORY_COLORS[poi.category] || '#3b82f6' }]} collapsable={false}>
                            <IconSymbol name={POI_CATEGORY_ICONS[poi.category] || 'location-sharp'} size={14} color="#fff" />
                        </View>
                    </MapLibreGL.PointAnnotation>
                ))}

                {/* Render saved places as pinned markers */}
                {savedPlaces.filter(place => (
                    place &&
                    Number.isFinite(Number(place.lng)) &&
                    Number.isFinite(Number(place.lat))
                )).map((place, idx) => (
                    <MapLibreGL.PointAnnotation
                        key={`saved-${place.id || place.name || idx}`}
                        id={`saved-${place.id || place.name || idx}`}
                        coordinate={[Number(place.lng), Number(place.lat)]}
                        onSelected={() => {
                            mapLogic.setRegion([Number(place.lng), Number(place.lat)]);
                            mapLogic.setLocationName(place.name);
                        }}
                        anchor={{ x: 0.5, y: 1 }}
                    >
                        <View style={[styles.savedMarkerBox, { backgroundColor: colors.activeCard }]} collapsable={false}>
                            <IconSymbol name="bookmark.fill" size={20} color="#fff" />
                        </View>
                    </MapLibreGL.PointAnnotation>
                ))}

                {/*map marker*/}
                <MapLibreGL.PointAnnotation
                    id="marker"
                    coordinate={safeRegion}
                    draggable={true}
                    onDragEnd={handleMapPress}
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
                originName={hasDestinationSet ? originDisplayName : undefined}
                destinationName={hasDestinationSet ? mapLogic.locationName : undefined}
                onSwapOriginDestination={hasDestinationSet ? () => {
                    // Swap: reverse geocode current region back to user location
                    if (mapLogic.currentCoords) {
                        mapLogic.setRegion(mapLogic.currentCoords);
                        void mapLogic.reverseGeocode(mapLogic.currentCoords);
                    }
                } : undefined}
            />

            {riskHeatmapPoints.length > 0 && mapLogic.suggestions.length === 0 && (
                <View style={[styles.heatmapWrapper, { top: hasDestinationSet ? 165 : 115 }]}>
                    <TouchableOpacity
                        style={[styles.heatmapCircleBtn, { backgroundColor: colors.background }]}
                        onPress={() => setIsHeatmapExpanded(prev => !prev)}
                        activeOpacity={0.8}
                    >
                        <IconSymbol name="info.circle.fill" size={20} color={colors.primaryIcon} />
                        <Text style={[styles.heatmapIconLabel, { color: colors.text }]}>Heatmap</Text>
                        <IconSymbol name={isHeatmapExpanded ? "chevron.up" : "chevron.down"} size={14} color={colors.subtitle} />
                    </TouchableOpacity>

                    {isHeatmapExpanded && (
                        <View style={[styles.heatmapLegendExpanded, { backgroundColor: colors.background }]}>
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
                </View>
            )}

            {/*zoom and auto locate */}
            <View style={[styles.mapControls, { bottom: isExpanded ? 520 : 240 }]}>
                <View style={[styles.zoomControlsContainer, { backgroundColor: colors.background }]}>
                    <TouchableOpacity
                        style={styles.controlBtn}
                        onPress={() => {
                            setIsUserPanning(true);
                            setIsUserZooming(true);
                            const nextZoom = Math.min(20, Math.round((currentZoomRef.current || 15) + 1));
                            currentZoomRef.current = nextZoom;
                            cameraRef.current?.setCamera({
                                zoomLevel: nextZoom,
                                animationDuration: 250,
                                animationMode: 'easeTo',
                            });
                        }}
                    >
                        <IconSymbol name="add" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View style={[styles.controlDivider, { backgroundColor: colors.hr }]} />

                    <TouchableOpacity
                        style={styles.controlBtn}
                        onPress={() => {
                            setIsUserPanning(true);
                            setIsUserZooming(true);
                            const nextZoom = Math.max(2, Math.round((currentZoomRef.current || 15) - 1));
                            currentZoomRef.current = nextZoom;
                            cameraRef.current?.setCamera({
                                zoomLevel: nextZoom,
                                animationDuration: 250,
                                animationMode: 'easeTo',
                            });
                        }}
                    >
                        <IconSymbol name="remove" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.locateBtn, { backgroundColor: colors.primaryIcon, marginTop: 12 }]}
                    onPress={() => {
                        setIsUserPanning(false);
                        setIsUserZooming(false);
                        void mapLogic.handleLocateMe();
                    }}
                >
                    <IconSymbol name="locate" size={24} color="#ffffff" />
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
                        {mapLogic.isRouteCalculating ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                <ActivityIndicator size="small" color={colors.primaryIcon} />
                                <Text style={[styles.routeSummaryText, { color: colors.primaryIcon }]}>
                                    Calculating route...
                                </Text>
                            </View>
                        ) : routeDistanceMeters !== null && routeEtaSeconds !== null ? (
                            <Text style={[styles.routeSummaryText, { color: colors.primaryIcon }]}>
                                {selectedAltRoute ? 'Alt Route' : (hasRoadRoute ? 'Road Route' : 'Route')}: {formatDistance(routeDistanceMeters)} • ~{formatEta(routeEtaSeconds)}
                            </Text>
                        ) : null}
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
                                toValue: minHeight,
                                useNativeDriver: false
                            }).start();
                            setIsExpanded(false);
                        }}>
                        Track Destination
                    </PrimaryButton>
                )}
            </Animated.View>

            <DriverStopModal
                visible={isStopModalVisible}
                onClose={() => setIsStopModalVisible(false)}
                onConfirm={(reason, stopType, durationMinutes) => {
                    mapLogic.startDriverStop(reason, stopType, durationMinutes);
                    setIsStopModalVisible(false);
                }}
            />

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
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    savedMarkerBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    userLocationDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userLocationDotInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#2563eb',
        borderWidth: 2,
        borderColor: '#ffffff',
    },
    heatmapWrapper: {
        position: 'absolute',
        right: 16,
        zIndex: 999,
        alignItems: 'flex-end',
    },
    heatmapCircleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 6,
    },
    heatmapIconLabel: {
        fontSize: 12,
        fontWeight: '700',
    },
    heatmapLegendExpanded: {
        marginTop: 8,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        maxWidth: 260,
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 8,
        elevation: 6,
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
    poiMarker: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
    },
    altBadge: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    altBadgeText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
    },
});
