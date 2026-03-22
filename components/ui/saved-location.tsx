import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

interface SavedLocationProps {
  name: string;
  address: string;
  onSetAlarm: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function SavedLocationCard({ name, address, onSetAlarm, onEdit, onDelete }: SavedLocationProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  return (
    <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.activeCard }]}>
      <View style={styles.headerRow}>
        <IconSymbol name="location-sharp" size={20} color={colors.activeCard} />
        <Text style={[styles.nameText, { color: colors.text }]}>
          {name}
        </Text>
      </View>
      
      <Text style={[styles.addressText, { color: colors.subtitle }]}>
        {address}
      </Text>
      
      <View style={[styles.divider, { backgroundColor: colors.hr }]} />

      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={[styles.alarmBtn, { backgroundColor: colors.activeCard }]} 
          onPress={onSetAlarm}
        >
          <IconSymbol name="bell" size={18} color={colors.activeText} />
          <Text style={[styles.alarmBtnText, { color: colors.activeText }]}>
            Set Alarm
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.utilityBtn, { backgroundColor: colors.modalThanks }]} 
          onPress={onEdit}
        >
          <IconSymbol name="clock.fill" size={20} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.utilityBtn, { backgroundColor: colors.modalThanks }]} 
          onPress={onDelete}
        >
          <IconSymbol name="trash.fill" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
    card: { 
      borderRadius: 18, 
      padding: 18, 
      borderWidth: 1.5, 
      marginBottom: 16 
    },
    headerRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      marginBottom: 4 
    },
    nameText: { 
      fontSize: 16, 
      fontWeight: '700' 
    },
    addressText: { 
      fontSize: 13, 
      marginBottom: 12 
    },
    divider: { 
      height: 1, 
      width: '100%', 
      marginBottom: 14 
    },
    actionRow: { 
      flexDirection: 'row', 
      gap: 10 
    },
    alarmBtn: { 
      flex: 3, 
      height: 48,
      borderRadius: 12, 
      flexDirection: 'row', 
      justifyContent: 'center', 
      alignItems: 'center', 
      gap: 6 
    },
    alarmBtnText: { 
      fontWeight: 'bold', 
      fontSize: 15 
    },
    utilityBtn: { 
      flex: 1, 
      height: 48, 
      borderRadius: 12, 
      justifyContent: 'center',
      alignItems: 'center' 
    },
});