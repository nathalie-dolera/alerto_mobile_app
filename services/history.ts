import { Platform } from 'react-native';

const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api`;

export interface TripData {
  id: string;
  date: number; 
  destinationName: string;
  durationMs: number;
  alertsTriggeredCount: number;
  responseTimes: number[];
  unsafeZonesEncountered: string[]; 
}

export const HistoryService = {
  async fetchTrips(userId: string): Promise<TripData[]> {
    try {
      const response = await fetch(`${API_URL}/mobile/trips?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch trips');
      const data = await response.json();
      
      return data.map((trip: any) => ({
        ...trip,
        date: new Date(trip.date).getTime(),
      }));
    } catch (e) {
      console.warn('HistoryService.fetchTrips warning:', e);
      return [];
    }
  },

  async saveTrip(userId: string, trip: TripData): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/mobile/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...trip, userId }),
      });
      return response.ok;
    } catch (e) {
      console.error('HistoryService.saveTrip error:', e);
      return false;
    }
  },

  async deleteTrip(userId: string, tripId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/mobile/trips?userId=${userId}&tripId=${tripId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (e) {
      console.error('HistoryService.deleteTrip error:', e);
      return false;
    }
  },

  async clearHistory(userId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/mobile/trips?userId=${userId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (e) {
      console.error('HistoryService.clearHistory error:', e);
      return false;
    }
  }
};
