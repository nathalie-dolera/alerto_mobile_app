import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { EmergencyService } from '@/services/emergency-service';

interface AuthContextType {
  user: any;
  isLoading: boolean;
  login: (userData: any) => void;
  logout: () => void;
  updateUser: (userData: any) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const normalizeUser = (userData: any) => {
    if (!userData) return null;
    return {
      ...userData,
      id: userData.id || userData._id || userData.email,
    };
  };

  useEffect(() => {
    SecureStore.getItemAsync('user').then((savedUser) => {
      if (savedUser) {
        const parsed = normalizeUser(JSON.parse(savedUser));
        setUser(parsed);
        // Ensure EmergencyService knows the user on app start
        void EmergencyService.setUserId(parsed?.id || null);
      }
      setIsLoading(false);
    });
  }, []);

  const login = async (userData: any) => {
    const normalized = normalizeUser(userData);
    setUser(normalized);
    await SecureStore.setItemAsync('user', JSON.stringify(normalized));
    // Set user ID so emergency contacts & quick destinations load correctly
    await EmergencyService.setUserId(normalized?.id || null);
  };

  const logout = async () => {
    setUser(null);
    await SecureStore.deleteItemAsync('user');
    // Clear user scope but DON'T delete data — it persists for next login
    await EmergencyService.setUserId(null);
  };

  const updateUser = async (updatedData: any) => {
    const newUser = normalizeUser({ ...user, ...updatedData });
    setUser(newUser);
    await SecureStore.setItemAsync('user', JSON.stringify(newUser));
  };

  const contextValue = useMemo(() => ({ user, isLoading, login, logout, updateUser }), [user, isLoading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};