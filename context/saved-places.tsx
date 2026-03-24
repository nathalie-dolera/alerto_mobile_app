import { SavedPlaceData, SavedPlacesService } from '@/services/saved-places';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

interface SavedPlacesContextType {
    savedPlaces: SavedPlaceData[];
    isLoadingSaved: boolean;
    loadSavedPlaces: () => Promise<void>;
    deleteSavedPlace: (id: string) => Promise<void>;
}

const SavedPlacesContext = createContext<SavedPlacesContextType | undefined>(undefined);
import { useAuth } from '@/context/auth';

export function SavedPlacesProvider({ children }: { children: React.ReactNode }) {
    const [savedPlaces, setSavedPlaces] = useState<SavedPlaceData[]>([]);
    const [isLoadingSaved, setIsLoadingSaved] = useState(true);
    const { user } = useAuth();

    const loadSavedPlaces = async () => {
        if (!user || !user.id) return;
        setIsLoadingSaved(true);
        try {
            const data = await SavedPlacesService.getAll(user.id);
            setSavedPlaces(data);
        } catch (error) {
            Alert.alert("Error", "Could not load saved places.");
        } finally {
            setIsLoadingSaved(false);
        }
    };

    const deleteSavedPlace = async (id: string) => {
        try {
            await SavedPlacesService.delete(id);
            setSavedPlaces(prev => prev.filter(place => place.id !== id));
        } catch (error) {
            console.error("Delete error:", error);
            Alert.alert("Error", "Failed to delete place.");
        }
    };

    useEffect(() => {
        if (user) {
            loadSavedPlaces();
        } else {
            setSavedPlaces([]);
        }
    }, [user]);

    return (
        <SavedPlacesContext.Provider value={{
            savedPlaces,
            isLoadingSaved,
            loadSavedPlaces,
            deleteSavedPlace,
        }}>
            {children}
        </SavedPlacesContext.Provider>
    );
}

export function useSavedPlacesContext() {
    const context = useContext(SavedPlacesContext);
    if (!context) {
        throw new Error('useSavedPlacesContext must be used within a SavedPlacesProvider');
    }
    return context;
}