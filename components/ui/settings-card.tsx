import { Colors } from '@/constants/color';
import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

interface SettingsCardProps {
    children: React.ReactNode;
}

export function SettingsCard({ children }: SettingsCardProps) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    
    return (
        <View style={[
            styles.card, 
            { 
                backgroundColor: theme === 'light' ? '#eaf2ff' : colors.card, 
                borderColor: theme === 'light' ? '#cce0ff' : colors.hr 
            }
        ]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 25,
        overflow: 'hidden',
    },
});