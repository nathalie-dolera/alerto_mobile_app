import { IconSymbol } from '@/components/ui/icon-symbol';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ToggleCardProps {
  title: string;
  subtitle: string;
  iconName: string;
  isActive: boolean;
  onPress: () => void;
  colors: any;
}

export function ToggleCard({ title, subtitle, iconName, isActive, onPress, colors }: ToggleCardProps) {
  return (
    <TouchableOpacity 
      style={[
        styles.card, 
        { 
          backgroundColor: isActive ? colors.activeCard : colors.configColor,
          borderColor: isActive ? colors.activeCard : colors.hr 
        }
      ]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.cardLeft}>

        <View style={[styles.iconBox, { backgroundColor: isActive ? colors.activeIconBox : colors.modalThanks }]}>
          <IconSymbol name={iconName} size={24} color={isActive ? colors.activeText : colors.primaryIcon} />
        </View>

        <View>
          <Text style={[styles.cardTitle, { color: isActive ? colors.activeText : colors.text }]}>
              {title}
          </Text>
          <Text style={[styles.cardSubtitle, { color: isActive ? colors.activeText : colors.subtitle }]}>
            {subtitle}
          </Text>
        </View>

      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { 
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12 
},
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15 
},
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center' 
},
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2 
},
  cardSubtitle: {
    fontSize: 13 
},
});