import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from './icon-symbol';

interface MapTopBar {
  onBack: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: () => void;
  colors: any; 
}

export function MapTopBar({ onBack, searchQuery, setSearchQuery, onSearch, colors }: MapTopBar) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.background }]} onPress={onBack}>
        <IconSymbol name="ionicons.fill" size={24} color={colors.text} />
      </TouchableOpacity>
      
      <View style={[styles.searchBox, { backgroundColor: colors.background }]}>
        <IconSymbol name="magnifyingglass" size={20} color={colors.text} />
        <TextInput 
          style={[styles.searchInput, { color: colors.text}]} 
          placeholder="Search destination..." 
          placeholderTextColor={colors.subtitle} 
          value={searchQuery} 
          onChangeText={setSearchQuery} 
          onSubmitEditing={onSearch} 
          returnKeyType="search" 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { 
    position: 'absolute', 
    top: 50, 
    left: 20, 
    right: 20, 
    flexDirection: 'row', 
    gap: 10, 
    alignItems: 'center' 
  },
  iconButton: { 
    padding: 12, 
    borderRadius: 50, 
    elevation: 5, 
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 5 
  },
  searchBox: { 
    flex: 1, 
    paddingHorizontal: 12, 
    borderRadius: 25,
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10, 
    elevation: 5, 
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 5, 
    height: 48 
  },
  searchInput: { 
    flex: 1, 
    fontSize: 16 
  }, 
});