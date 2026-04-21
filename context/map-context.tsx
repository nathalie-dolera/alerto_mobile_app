import { LocationPermissionModal } from '@/components/ui/location-permission-modal';
import { useAuth } from '@/context/auth';
import { useBleContext } from '@/context/ble-context';
import { useHistoryContext } from '@/context/history-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Linking } from 'react-native';
import { fetchHazards, fetchRiskHeatmap, HazardPoint, RiskHeatmapPoint } from '../services/hazards';
import { calculateDistance } from '../utils/location';
import { requestNotificationPermissions, sendLocalNotification } from '../utils/notifications';


interface RecentSearch {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Suggestion {
    id: string;
    name: string;
    lat: number;
    lng: number;
    displayName: string;
}

interface MapContextType {
  region: [number, number];
  zoomLevel: number;
  locationName: string;
  recentSearches: RecentSearch[];
  searchQuery: string;
  favorites: string[];
  setRegion: (coords: [number, number]) => void;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  setLocationName: (name: string) => void;
  setSearchQuery: (query: string) => void;
  suggestions: Suggestion[];
  setSuggestions: (suggestions: Suggestion[]) => void;
  fetchSuggestions: (query: string) => Promise<void>;
  setRecentSearches: React.Dispatch<React.SetStateAction<RecentSearch[]>>;
  reverseGeocode: (coords: [number, number]) => Promise<void>;
  handleSearch: () => Promise<void>;
  handleLocateMe: () => Promise<void>;
  toggleFavorite: (name: string) => void;
  addToRecent: (name: string, lat: number, lng: number) => void;
  clearRecentSearches: () => void;
  isAlarmActive: boolean;
  activeAlarmDestination: string;
  startAlarm: (destinationName: string, lat: number, lng: number, thresholdMeters: number) => void;
  stopAlarm: () => void;
  hazardPoints: HazardPoint[];
  riskHeatmapPoints: RiskHeatmapPoint[];
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export function MapProvider({ children }: { children: React.ReactNode }) {
    const [region, setRegion] = useState<[number, number]>([121.7740, 12.8797]);
    const [zoomLevel, setZoomLevel] = useState(15);
    const [locationName, setLocationName] = useState("Locating...");
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
    const [isAlarmActive, setIsAlarmActive] = useState(false);
    const [activeAlarmDestination, setActiveAlarmDestination] = useState('');
    const [destinationCoords, setDestinationCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [arrivalThresholdMeters, setArrivalThresholdMeters] = useState<number>(500);
    const [hazardPoints, setHazardPoints] = useState<HazardPoint[]>([]);
    const [riskHeatmapPoints, setRiskHeatmapPoints] = useState<RiskHeatmapPoint[]>([]);
    const notifiedHazardsRef = useRef<Set<string>>(new Set());
    const notifiedArrivalRef = useRef<boolean>(false);
    
    //history tracking references
    const tripSessionRef = useRef({
      startTime: 0,
      alertsCount: 0,
      unsafeZones: new Set<string>(),
      responseTimes: [] as number[],
      currentResponseStartTime: null as number | null
    });

  const { user } = useAuth();
  const { addTrip } = useHistoryContext();
  const { syncAlarmConfig } = useBleContext();

  const addToRecent = (name: string, lat: number, lng: number) => {
        setRecentSearches(prev => {
        const filtered = prev.filter(item => item.name !== name);
        return [{ id: Date.now().toString(), name, lat, lng }, ...filtered];
        });
    };

    const toggleFavorite = (name: string) => {
        setFavorites(prev => prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]);
    };

    const reverseGeocode = async (coords: [number, number]) => {
    try {
        setLocationName("");
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lon=${coords[0]}&lat=${coords[1]}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'AlertoApp/1.0' } });
        const data = await response.json();

        if (data && data.display_name) {
            const shortName = data.display_name.split(',')[0].toUpperCase();
            setLocationName(shortName);
            addToRecent(shortName, coords[1], coords[0]);
        } else {
            setLocationName("UNKNOWN LOCATION");
        }
        } catch (error) {
            setLocationName("LOCATION PINNED")
        }
    };

        const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        Keyboard.dismiss();

        try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ph&limit=1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'AlertoApp/1.0' } });
        const data = await response.json();

        if (data && data.length > 0) {
            const { lat, lon, display_name } = data[0];
            const newCoords: [number, number] = [parseFloat(lon), parseFloat(lat)];
            setRegion(newCoords);
            const shortName = display_name.split(',')[0].toUpperCase();
            setLocationName(shortName);
            addToRecent(shortName, parseFloat(lat), parseFloat(lon));
        } else {
            Alert.alert("Location Not Found");
        }
        } catch (error) {
        Alert.alert("Error");
        }
    };

    const fetchSuggestions = async (query: string) => {
        if (!query.trim() || query.length < 2) {
            setSuggestions([]);
            return;
        }

        try {
            //Photon API
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lon=${region[0]}&lat=${region[1]}&location_bias_scale=0.5`;
            const response = await fetch(url);
            const data = await response.json();

            if (data && data.features) {
                const fetchedSuggestions: Suggestion[] = data.features.map((f: any) => ({
                    id: f.properties.osm_id?.toString() || Math.random().toString(),
                    name: f.properties.name || f.properties.city || "Unknown Location",
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    displayName: [
                        f.properties.name,
                        f.properties.city,
                        f.properties.country === 'Philippines' ? '' : f.properties.country
                    ].filter(Boolean).join(', ')
                }));
                setSuggestions(fetchedSuggestions);
            }
        } catch (error) {
            console.log("Suggestions fetch error:", error);
        }
    };

    const handleLocateMe = async () => {
        try {
            const allowLocationPref = await AsyncStorage.getItem('alerto_allow_location');
            if (allowLocationPref === 'false') {
                setLocationName("Location Disabled");
                setIsLocationModalVisible(true);
                return;
            }
        } catch (e) {
            console.error("Error reading location preference:", e);
        }

        const { status } = await Location.getForegroundPermissionsAsync();
        
        if (status !== 'granted') {
            setIsLocationModalVisible(true);
            return;
        }

        try {
            const lastKnown = await Location.getLastKnownPositionAsync();
            if (lastKnown) {
                const coords: [number, number] = [lastKnown.coords.longitude, lastKnown.coords.latitude];

                //to avoid default emulator HQ
                const isDefaultHQ = Math.abs(coords[0] - (-122.084)) < 0.1 && Math.abs(coords[1] - 37.422) < 0.1;
                
                if (!isDefaultHQ) {
                    setRegion(coords);
                    reverseGeocode(coords);
                }
            }

            const positionPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
            const location = await Promise.race([positionPromise, timeoutPromise]) as Location.LocationObject;

            const newCoords: [number, number] = [location.coords.longitude, location.coords.latitude];
            
            const isDefaultHQ = Math.abs(newCoords[0] - (-122.084)) < 0.1 && Math.abs(newCoords[1] - 37.422) < 0.1;
            
            if (!isDefaultHQ) {
                setRegion(newCoords);
                reverseGeocode(newCoords);
                checkLocationProximity(newCoords[0], newCoords[1]);
            }
        } catch (error) {
            console.log("GPS Timeout or Error, using fallback.");
        }
    };

    useEffect(() => {
        handleLocateMe();
        requestNotificationPermissions();
        
        Promise.all([fetchHazards(), fetchRiskHeatmap()]).then(([hazards, riskPoints]) => {
            setHazardPoints(hazards);
            setRiskHeatmapPoints(riskPoints);
        });
        
        let locationSub: Location.LocationSubscription;
        
        const startWatching = async () => {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
                locationSub = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        distanceInterval: 10, //update every 10 meters
                    },
                    (loc) => {
                        checkLocationProximity(loc.coords.longitude, loc.coords.latitude);
                    }
                );
            }
        };
        startWatching();

        return () => {
            if (locationSub) locationSub.remove();
        };
    }, []);

    const checkLocationProximity = (lng: number, lat: number) => {
        //for check hazards
        if (hazardPoints && hazardPoints.length > 0) {
            for (const hazard of hazardPoints) {
                const distance = calculateDistance(lat, lng, hazard.lat, hazard.lng);
                if (distance <= 500) { // threshold
                     if (!notifiedHazardsRef.current.has(hazard.id)) {
                         notifiedHazardsRef.current.add(hazard.id);
                         Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                         sendLocalNotification(
                             'Danger Ahead',
                             `You are approaching a high-risk area: ${hazard.type || hazard.category}`
                         );
                         
                         if (isAlarmActive) {
                             tripSessionRef.current.alertsCount += 1;
                             tripSessionRef.current.unsafeZones.add(hazard.type || hazard.category || 'Unknown');
                         }
                     }
                } else {
                     if (notifiedHazardsRef.current.has(hazard.id)) {
                         notifiedHazardsRef.current.delete(hazard.id);
                     }
                }
            }
        }

        //for check of destination arrival
        if (isAlarmActive && destinationCoords && !notifiedArrivalRef.current) {
            const distanceToDest = calculateDistance(lat, lng, destinationCoords.lat, destinationCoords.lng);
            
            if (distanceToDest <= arrivalThresholdMeters) {
                notifiedArrivalRef.current = true;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                sendLocalNotification(
                    'Arrived!',
                    `You have reached your destination: ${activeAlarmDestination}`
                );
                
                tripSessionRef.current.currentResponseStartTime = Date.now();
            }
        }
    };

  const clearRecentSearches = () => {
    setRecentSearches(prev => {
      return prev.filter(item => favorites.includes(item.name));
    });
  };

    //for loading data
    useEffect(() => {
    const loadPersistedData = async () => {
      if (!user) {
        setRecentSearches([]);
        setFavorites([]);
        return;
      }
      try {
        const savedSearches = await AsyncStorage.getItem(`alerto_recents_${user.id}`);
        const savedFavorites = await AsyncStorage.getItem(`alerto_favorites_${user.id}`);
        
        if (savedSearches) setRecentSearches(JSON.parse(savedSearches));
        if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error("Error loading local data", e);
      }
    };
    loadPersistedData();
  }, [user]);

    //for saving
    useEffect(() => {
    const savePersistedData = async () => {
      if (!user) return;
      try {
        await AsyncStorage.setItem(`alerto_recents_${user.id}`, JSON.stringify(recentSearches));
        await AsyncStorage.setItem(`alerto_favorites_${user.id}`, JSON.stringify(favorites));
      } catch (e) {
        console.error("Error saving local data", e);
      }
    };
    savePersistedData();
    }, [recentSearches, favorites, user]);

  const handleAllowLocationMap = async () => {
      setIsLocationModalVisible(false);
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
          await Location.requestBackgroundPermissionsAsync();
          await AsyncStorage.setItem('alerto_allow_location', 'true');
          handleLocateMe(); 
      } else {
          Alert.alert(
              "Permission Denied",
              "Location access is turned off in your device settings. Would you like to open Settings?",
              [
                  { text: "Not Now", style: "cancel" },
                  { text: "Open Settings", onPress: () => Linking.openSettings() }
              ]
          );
      }
  };

  const startAlarm = async (destinationName: string, lat: number, lng: number, thresholdMeters: number) => {
      setIsAlarmActive(true);
      setActiveAlarmDestination(destinationName);
      setDestinationCoords({ lat, lng });
      setArrivalThresholdMeters(thresholdMeters);
      notifiedArrivalRef.current = false;
      
      //hardware Sync
      await syncAlarmConfig({
          name: destinationName,
          lat,
          lng,
          threshold: thresholdMeters,
          timestamp: Date.now()
      });
      
      //reset session
      tripSessionRef.current = {
        startTime: Date.now(),
        alertsCount: 0,
        unsafeZones: new Set<string>(),
        responseTimes: [],
        currentResponseStartTime: null
      };
  };

  const stopAlarm = () => {
      if (isAlarmActive && tripSessionRef.current.startTime > 0) {
        const duration = Date.now() - tripSessionRef.current.startTime;
        
        if (tripSessionRef.current.currentResponseStartTime) {
            tripSessionRef.current.responseTimes.push(Date.now() - tripSessionRef.current.currentResponseStartTime);
        }

        addTrip({
            id: Date.now().toString(),
            date: tripSessionRef.current.startTime,
            destinationName: activeAlarmDestination,
            durationMs: duration,
            alertsTriggeredCount: tripSessionRef.current.alertsCount,
            responseTimes: [...tripSessionRef.current.responseTimes],
            unsafeZonesEncountered: Array.from(tripSessionRef.current.unsafeZones)
        });
      }

      setIsAlarmActive(false);
      setActiveAlarmDestination('');
      setDestinationCoords(null);
      notifiedArrivalRef.current = false;
  };

  return (
    <MapContext.Provider value={{
      region, zoomLevel, locationName, recentSearches, searchQuery, favorites, suggestions,
      setRegion, setZoomLevel, setLocationName, setSearchQuery, setRecentSearches, setSuggestions,
      reverseGeocode, handleSearch, handleLocateMe, toggleFavorite, addToRecent, clearRecentSearches, fetchSuggestions,
      isAlarmActive, activeAlarmDestination, startAlarm, stopAlarm, hazardPoints, riskHeatmapPoints
    }}>
      {children}
      <LocationPermissionModal 
          visible={isLocationModalVisible}
          onAllow={handleAllowLocationMap}
          onDeny={() => setIsLocationModalVisible(false)}
      />
    </MapContext.Provider>
  );
}

export const useMapContext = () => {
  const context = useContext(MapContext);
  if (!context) throw new Error("useMapContext must be used within a MapProvider");
  return context;
};
