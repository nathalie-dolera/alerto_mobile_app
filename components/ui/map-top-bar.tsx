import { StyleSheet, TextInput, TouchableOpacity, View, ScrollView, Text, Keyboard } from 'react-native';
import { IconSymbol } from './icon-symbol';
import { useMapContext, Suggestion } from '@/context/map-context';
import React, { useEffect, useRef } from 'react';

interface MapTopBarProps {
  onBack: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: () => void;
  colors: any; 
}

export function MapTopBar({ onBack, searchQuery, setSearchQuery, onSearch, colors }: MapTopBarProps) {
  const { suggestions, fetchSuggestions, setSuggestions, setRegion, setLocationName, addToRecent, locationName } = useMapContext();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (searchQuery.length >= 2 && searchQuery.toUpperCase() !== locationName.toUpperCase()) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(searchQuery);
      }, 300);
    } else {
      setSuggestions([]);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const handleSelectSuggestion = (item: Suggestion) => {
    setSuggestions([]);
    setSearchQuery(item.name.toUpperCase());
    setLocationName(item.name.toUpperCase());
    setRegion([item.lng, item.lat]);
    addToRecent(item.name.toUpperCase(), item.lat, item.lng);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.background }]} onPress={onBack}>
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
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
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(""); setSuggestions([]); }}>
                <IconSymbol name="xmark" size={18} color={colors.subtitle} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {suggestions.length > 0 && (
          <View style={[styles.suggestionsContainer, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="always">
                {suggestions.map((item, index) => (
                    <TouchableOpacity 
                        key={item.id} 
                        style={[styles.suggestionItem, index < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.hr }]}
                        onPress={() => handleSelectSuggestion(item)}
                    >
                        <View style={styles.suggestionIcon}>
                            <IconSymbol name="location.fill" size={16} color={colors.primaryIcon} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.suggestionName, { color: colors.text }]} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Text style={[styles.suggestionDetail, { color: colors.subtitle }]} numberOfLines={1}>
                                {item.displayName}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', 
    top: 50, 
    left: 20, 
    right: 20,
    zIndex: 1000,
  },
  topBar: { 
    flexDirection: 'row', 
    gap: 10, 
    alignItems: 'center' 
  },
  iconButton: { 
    padding: 12, 
    borderRadius: 50, 
    elevation: 8, 
    shadowColor: '#000', 
    shadowOpacity: 0.15, 
    shadowRadius: 8 
  },
  searchBox: { 
    flex: 1, 
    paddingHorizontal: 12, 
    borderRadius: 25,
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10, 
    elevation: 8, 
    shadowColor: '#000', 
    shadowOpacity: 0.15, 
    shadowRadius: 8, 
    height: 48 
  },
  searchInput: { 
    flex: 1, 
    fontSize: 16 
  },
  suggestionsContainer: {
    marginTop: 10,
    borderRadius: 20,
    maxHeight: 300,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    overflow: 'hidden',
    marginLeft: 54, // Align with search box
  },
  suggestionItem: {
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  suggestionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(59, 79, 176, 0.1)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  suggestionDetail: {
    fontSize: 12,
    marginTop: 2
  }
});