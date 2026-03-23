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

export function SavedPlacesProvider({ children }: { children: React.ReactNode }) {
    const [savedPlaces, setSavedPlaces] = useState<SavedPlaceData[]>([]);
    const [isLoadingSaved, setIsLoadingSaved] = useState(true);

    const loadSavedPlaces = async () => {
        setIsLoadingSaved(true);
        try {
            const data = await SavedPlacesService.getAll();
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
        loadSavedPlaces();
    }, []);

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