import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

interface SettingsRowProps {
    icon: any; 
    title: string;
    type?: 'link' | 'toggle';
    value?: boolean;
    onToggle?: (value: boolean) => void;
    onPress?: () => void;
    isLast?: boolean;
}

export function SettingsRow({ icon, title, type = 'link', value = false, onToggle, onPress, isLast = false }: SettingsRowProps) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];

    return (
        <View style={[styles.rowContainer, !isLast && { 
            borderBottomWidth: 1, 
            borderBottomColor: theme === 'light' ? '#cce0ff' : colors.hr }]}>
            <TouchableOpacity
                style={styles.rowClickable}
                disabled={type === 'toggle'}
                onPress={onPress}
                activeOpacity={0.7}
            >
                <View style={styles.rowLeft}>
                    <View style={[styles.iconCircle, 
                        { backgroundColor: theme === 'light' ? '#dbe6f5' : '#1e293b' }]}>
                        <IconSymbol name={icon} size={20} color={colors.containerText} />
                    </View>
                    <Text style={[styles.rowTitle, { color: colors.mainText }]}>{title}</Text>
                </View>

                {type === 'link' ? (
                    <IconSymbol name="chevron.right" size={20} color={colors.containerText} />
                ) : (
                    <Switch
                        value={value}
                        onValueChange={onToggle}
                        trackColor={{ false: '#d1d7e0', true: '#4ade80' }} 
                        thumbColor={'#fff'}
                    />
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    rowContainer: { 
        paddingHorizontal: 16 
    },
    rowClickable: { 
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14 
    },
    rowLeft: { 
        flexDirection: 'row', 
        alignItems: 'center' 
    },
    iconCircle: { 
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14
    },
    rowTitle: { 
        fontSize: 16,
        fontWeight: '500' 
    },
});