import { LocationPermissionModal } from '@/components/ui/location-permission-modal';
import { useAuth } from '@/context/auth';
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
  setRecentSearches: React.Dispatch<React.SetStateAction<RecentSearch[]>>;
  reverseGeocode: (coords: [number, number]) => Promise<void>;
  handleSearch: () => Promise<void>;
  handleLocateMe: () => Promise<void>;
  toggleFavorite: (name: string) => void;
  addToRecent: (name: string, lat: number, lng: number) => void;
  clearRecentSearches: () => void;
  isAlarmActive: boolean;
  activeAlarmDestination: string;
  startAlarm: (destinationName: string) => void;
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
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
    const [isAlarmActive, setIsAlarmActive] = useState(false);
    const [activeAlarmDestination, setActiveAlarmDestination] = useState('');
    const [hazardPoints, setHazardPoints] = useState<HazardPoint[]>([]);
    const [riskHeatmapPoints, setRiskHeatmapPoints] = useState<RiskHeatmapPoint[]>([]);
    const notifiedHazardsRef = useRef<Set<string>>(new Set());
    const { user } = useAuth();

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
                setRegion(coords);
                reverseGeocode(coords);
            }

            const positionPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
            const location = await Promise.race([positionPromise, timeoutPromise]) as Location.LocationObject;

            const newCoords: [number, number] = [location.coords.longitude, location.coords.latitude];
            setRegion(newCoords);
            reverseGeocode(newCoords);
            checkProximityToHazards(newCoords[0], newCoords[1]);
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
                        checkProximityToHazards(loc.coords.longitude, loc.coords.latitude);
                    }
                );
            }
        };
        startWatching();

        return () => {
            if (locationSub) locationSub.remove();
        };
    }, []);

    const checkProximityToHazards = (lng: number, lat: number) => {
        if (!hazardPoints || hazardPoints.length === 0) return;
        
        for (const hazard of hazardPoints) {
            const distance = calculateDistance(lat, lng, hazard.lat, hazard.lng);
            if (distance <= 500) { //threshold
                 if (!notifiedHazardsRef.current.has(hazard.id)) {
                     notifiedHazardsRef.current.add(hazard.id);
                     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                     sendLocalNotification(
                         'Danger Ahead',
                         `You are approaching a high-risk area: ${hazard.type || hazard.category}`
                     );
                 }
            } else {
                 if (notifiedHazardsRef.current.has(hazard.id)) {
                     //removed from notified list once exit so they can be warned again
                     notifiedHazardsRef.current.delete(hazard.id);
                 }
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

  const startAlarm = (destinationName: string) => {
      setIsAlarmActive(true);
      setActiveAlarmDestination(destinationName);
  };

  const stopAlarm = () => {
      setIsAlarmActive(false);
      setActiveAlarmDestination('');
  };

  return (
    <MapContext.Provider value={{
      region, zoomLevel, locationName, recentSearches, searchQuery, favorites,
      setRegion, setZoomLevel, setLocationName, setSearchQuery, setRecentSearches,
      reverseGeocode, handleSearch, handleLocateMe, toggleFavorite, addToRecent, clearRecentSearches,
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
