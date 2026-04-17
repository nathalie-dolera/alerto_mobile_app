import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) {
        setTripHistory([]);
        return;
      }
      try {
        //try Loading from Local
        const savedHistory = await AsyncStorage.getItem(`alerto_trip_history_${user.id}`);
        if (savedHistory) {
          setTripHistory(JSON.parse(savedHistory));
        }

        //sync from Backend to keep updated
        const backendTrips = await HistoryService.fetchTrips(user.id);
        if (backendTrips.length > 0) {
            setTripHistory(backendTrips);
            await AsyncStorage.setItem(`alerto_trip_history_${user.id}`, JSON.stringify(backendTrips));
        }
      } catch (e) {
        console.error("Error loading trip history", e);
      }
    };
    loadHistory();
  }, [user]);

  const addTrip = async (trip: TripData) => {
    const newHistory = [trip, ...tripHistory];
    setTripHistory(newHistory);
    
    if (user) {
      try {
        await AsyncStorage.setItem(`alerto_trip_history_${user.id}`, JSON.stringify(newHistory));
        
        await HistoryService.saveTrip(user.id, trip);
      } catch (e) {
        console.error("Error saving trip history", e);
      }
    }
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
