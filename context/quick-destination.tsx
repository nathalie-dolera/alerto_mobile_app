import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

interface QuickDestinationsContextType {
    quickPlaceIds: string[];
    toggleQuickPlace: (id: string) => void;
}

const QuickDestinationsContext = createContext<QuickDestinationsContextType | undefined>(undefined);
import { useAuth } from '@/context/auth';

export function QuickDestinationsProvider({ children }: { children: React.ReactNode }) {
    const [quickPlaceIds, setQuickPlaceIds] = useState<string[]>([]);
    const { user } = useAuth();

    useEffect(() => {
        const loadQuickPlaces = async () => {
            if (!user) {
                setQuickPlaceIds([]);
                return;
            }
            try {
                const stored = await AsyncStorage.getItem(`@quick_places_${user.id}`);
                if (stored) {
                    setQuickPlaceIds(JSON.parse(stored));
                } else {
                    setQuickPlaceIds([]);
                }
            } catch (e) {
                console.error("Error loading", e);
            }
        };
        loadQuickPlaces();
    }, [user]);

    const toggleQuickPlace = (id: string) => {
        setQuickPlaceIds(prev => {
            const currentIds = prev || [];
            
            if (currentIds.includes(id)) {
                const newIds = currentIds.filter(i => i !== id);
                if (user) AsyncStorage.setItem(`@quick_places_${user.id}`, JSON.stringify(newIds));
                return newIds;
            }

            if (currentIds.length >= 4) {
                Alert.alert("You can only have up to 4 Quick Destinations.");
                return currentIds;
            }

            const newIds = [...currentIds, id];
            if (user) AsyncStorage.setItem(`@quick_places_${user.id}`, JSON.stringify(newIds));
            return newIds;
        });
    };

    return (
        <QuickDestinationsContext.Provider value={{ quickPlaceIds, toggleQuickPlace }}>
            {children}
        </QuickDestinationsContext.Provider>
    );
}

export function useQuickDestinations() {
    const context = useContext(QuickDestinationsContext);
    if (!context) {
        throw new Error('useQuickDestinations must be used within a QuickDestinationsProvider');
    }
    return context;
}