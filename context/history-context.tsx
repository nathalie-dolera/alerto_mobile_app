import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { HistoryService, TripData } from '../services/history';
import { useAuth } from './auth';

export { TripData };

interface HistoryContextType {
  tripHistory: TripData[];
  addTrip: (trip: TripData) => void;
  deleteTrip: (id: string) => void;
  clearHistory: () => void;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [tripHistory, setTripHistory] = useState<TripData[]>([]);
  const { user } = useAuth();
  const isLoadedRef = useRef(false);

  useEffect(() => {
    isLoadedRef.current = false;
    const loadHistory = async () => {
      if (!user) {
        setTripHistory([]);
        isLoadedRef.current = true;
        return;
      }
      try {
        const userKey = `alerto_trip_history_${user.id}`;
        // Try loading from local storage
        let localData: TripData[] = [];
        const savedHistory = await AsyncStorage.getItem(userKey);
        if (savedHistory) {
          localData = JSON.parse(savedHistory);
          setTripHistory(localData);
        } else {
          // Check for legacy unscoped history and migrate
          const legacy = await AsyncStorage.getItem('alerto_trip_history');
          if (legacy) {
            localData = JSON.parse(legacy);
            setTripHistory(localData);
            await AsyncStorage.setItem(userKey, legacy);
          }
        }
        isLoadedRef.current = true;

        // Sync from Backend to keep updated if available
        try {
          const backendTrips = await HistoryService.fetchTrips(user.id);
          if (backendTrips && backendTrips.length > 0) {
            // Merge backend trips with local trips without duplicates
            const combinedMap = new Map<string, TripData>();
            [...backendTrips, ...localData].forEach(t => combinedMap.set(t.id, t));
            const merged = Array.from(combinedMap.values()).sort((a, b) => b.date - a.date);
            setTripHistory(merged);
            await AsyncStorage.setItem(userKey, JSON.stringify(merged));
          }
        } catch {
          // Backend sync error is non-fatal; local data is preserved
        }
      } catch (e) {
        console.error("Error loading trip history", e);
        isLoadedRef.current = true;
      }
    };
    loadHistory();
  }, [user]);

  const addTrip = async (trip: TripData) => {
    setTripHistory(prev => {
      const newHistory = [trip, ...prev];
      if (user) {
        AsyncStorage.setItem(`alerto_trip_history_${user.id}`, JSON.stringify(newHistory)).catch(e =>
          console.error("Error saving trip history", e)
        );
        HistoryService.saveTrip(user.id, trip).catch(() => {});
      }
      return newHistory;
    });
  };

  const clearHistory = async () => {
    setTripHistory([]);
    if (user) {
      try {
        await AsyncStorage.removeItem(`alerto_trip_history_${user.id}`);
        await HistoryService.clearHistory(user.id);
      } catch (e) {
        console.error("Error clearing trip history", e);
      }
    }
  };

  const deleteTrip = async (id: string) => {
    const newHistory = tripHistory.filter(trip => trip.id !== id);
    setTripHistory(newHistory);
    if (user) {
      try {
        await AsyncStorage.setItem(`alerto_trip_history_${user.id}`, JSON.stringify(newHistory));
        await HistoryService.deleteTrip(user.id, id);
      } catch (e) {
        console.error("Error deleting trip", e);
      }
    }
  };

  return (
    <HistoryContext.Provider value={{ tripHistory, addTrip, deleteTrip, clearHistory }}>
      {children}
    </HistoryContext.Provider>
  );
}

export const useHistoryContext = () => {
  const context = useContext(HistoryContext);
  if (!context) throw new Error("useHistoryContext must be used within a HistoryProvider");
  return context;
};
