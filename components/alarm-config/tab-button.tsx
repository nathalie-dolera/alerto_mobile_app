import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

interface TabButtonProps {
  title: string;
  isActive: boolean;
  onPress: () => void;
  colors: any;
}

export function TabButton({ title, isActive, onPress, colors }: TabButtonProps) {
  return (
    <TouchableOpacity 
      style={[
        styles.tab, 
        { 
        backgroundColor: isActive ? colors.activeCard : 'transparent'      
      }
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.tabText, 
        { color: isActive ? colors.activeText : colors.subtitle }
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tab: { 
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10 
},
  tabText: { 
    fontWeight: '600',
    fontSize: 14 
},
});