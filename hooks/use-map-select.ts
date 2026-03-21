import * as Location from 'expo-location';
import { useEffect, useState } from "react";
import { Alert, Keyboard } from "react-native";


interface RecentSearch {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export function useMapSelect() {
    const [region, setRegion] = useState<[number, number]>([121.7740, 12.8797]);
    const [zoomLevel, setZoomLevel] = useState(15);
    const [locationName, setLocationName] = useState("Locating...");    
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [favorites, setFavorites] = useState<string[]>([]);

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
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Please enable location.');
            setLocationName("LOCATION PINNED");
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
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
            const location = await Promise.race([positionPromise, timeoutPromise]) as Location.LocationObject;

            const newCoords: [number, number] = [location.coords.longitude, location.coords.latitude];
            setRegion(newCoords);
            reverseGeocode(newCoords);
            } catch (error) {
            console.log("GPS Timeout or Error, using fallback.");
            }
        };

        useEffect(() => {
            handleLocateMe();
        }, []);
        
        

    return {
        zoomLevel, region, setRegion, setLocationName, reverseGeocode, searchQuery, setSearchQuery, handleSearch, handleLocateMe, setZoomLevel,
        locationName, recentSearches, favorites, toggleFavorite, addToRecent
    };
}