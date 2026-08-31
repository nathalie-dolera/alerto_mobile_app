import { Suggestion, useMapContext } from '@/context/map-context';
import { formatSearchResultLabel } from '@/utils/location';
import { isWithinPhilippinesBounds } from '@/utils/philippines';
import React, { useRef, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from './icon-symbol';

interface MapTopBarProps {
  onBack: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearch: () => void;
  colors: any;
  /** If provided, shows the dual origin+destination card instead of a single search bar */
  originName?: string;
  destinationName?: string;
  onOriginPress?: () => void;
  onDestinationPress?: () => void;
  onSwapOriginDestination?: () => void;
}

type ActiveField = 'origin' | 'destination' | null;

export function MapTopBar({
  onBack,
  searchQuery,
  setSearchQuery,
  onSearch,
  colors,
  originName,
  destinationName,
  onOriginPress,
  onDestinationPress,
  onSwapOriginDestination,
}: MapTopBarProps) {
  const { suggestions, fetchSuggestions, setSuggestions, setRegion, setLocationName, addToRecent, locationName } = useMapContext();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [originQuery, setOriginQuery] = useState(originName ?? '');
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [destQuery, setDestQuery] = useState(searchQuery);
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isDualMode = originName !== undefined;

  const handleSearchChange = (text: string) => {
    if (isDualMode && activeField === 'destination') {
      setDestQuery(text);
      setSearchQuery(text);
    } else if (isDualMode && activeField === 'origin') {
      setOriginQuery(text);
    } else {
      setLocalQuery(text);
      setSearchQuery(text);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (text.trim().length >= 1) {
        fetchSuggestions(text);
      } else {
        setSuggestions([]);
      }
    }, 150);
  };

  const handleSelectSuggestion = (item: Suggestion) => {
    if (!isWithinPhilippinesBounds([item.lng, item.lat])) {
      Alert.alert('Philippines Only', 'Please choose a location within the Philippines.');
      return;
    }

    const resolvedLabel = formatSearchResultLabel(item.displayName, item.name) || item.name;

    setSuggestions([]);
    setRegion([item.lng, item.lat]);
    addToRecent(resolvedLabel, item.lat, item.lng);

    if (isDualMode && activeField === 'origin') {
      setOriginQuery(resolvedLabel);
      setActiveField(null);
    } else {
      setSearchQuery(resolvedLabel);
      setLocationName(resolvedLabel);
      if (isDualMode) {
        setDestQuery(resolvedLabel);
        setActiveField(null);
      }
    }

    Keyboard.dismiss();
  };

  if (isDualMode) {
    return (
      <View style={styles.container}>
        {/* Dual Card */}
        <View style={[styles.dualCard, { backgroundColor: colors.background }]}>
          {/* Back button */}
          <TouchableOpacity style={styles.dualBackBtn} onPress={onBack}>
            <IconSymbol name="chevron.left" size={22} color={colors.text} />
          </TouchableOpacity>

          {/* Icon Column (Origin Dot -> Connector Dots -> Destination Pin) */}
          <View style={styles.iconColumn}>
            <View style={styles.dualDotOrigin} />
            <View style={styles.verticalDottedLine}>
              <View style={[styles.dotConnectorDot, { backgroundColor: colors.subtitle }]} />
              <View style={[styles.dotConnectorDot, { backgroundColor: colors.subtitle }]} />
              <View style={[styles.dotConnectorDot, { backgroundColor: colors.subtitle }]} />
            </View>
            <IconSymbol name="location.fill" size={14} color="#ef4444" />
          </View>

          {/* Origin + Destination Input Column */}
          <View style={{ flex: 1 }}>
            {/* Origin row */}
            <View style={styles.dualRow}>
              <TextInput
                ref={originInputRef}
                style={[styles.dualInput, { color: colors.text }]}
                placeholder="Your location"
                placeholderTextColor={colors.subtitle}
                value={activeField === 'origin' ? originQuery : (originName ?? 'Current Location')}
                onFocus={() => {
                  setActiveField('origin');
                  setOriginQuery('');
                  if (onOriginPress) onOriginPress();
                }}
                onChangeText={handleSearchChange}
                returnKeyType="search"
              />
            </View>

            <View style={[styles.dualDivider, { backgroundColor: colors.hr }]} />

            {/* Destination row */}
            <View style={styles.dualRow}>
              <TextInput
                ref={destInputRef}
                style={[styles.dualInput, { color: colors.text }]}
                placeholder="Search destination..."
                placeholderTextColor={colors.subtitle}
                value={activeField === 'destination' ? destQuery : (destinationName ?? searchQuery)}
                onFocus={() => {
                  setActiveField('destination');
                  setDestQuery('');
                  setSearchQuery('');
                  setSuggestions([]);
                }}
                onChangeText={handleSearchChange}
                onSubmitEditing={onSearch}
                returnKeyType="search"
              />
            </View>
          </View>

          {/* Swap Button */}
          {onSwapOriginDestination && (
            <TouchableOpacity style={styles.swapBtn} onPress={onSwapOriginDestination}>
              <IconSymbol name="arrow.up.arrow.down" size={20} color={colors.subtitle} />
            </TouchableOpacity>
          )}
        </View>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <View style={[styles.suggestionsContainer, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="always">
              {suggestions.map((item, index) => (
                <TouchableOpacity
                  key={`${item.id}-${index}`}
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

  // --- Default single search bar ---
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.background }]} onPress={onBack}>
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={[styles.searchBox, { backgroundColor: colors.background }]}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.text} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search destination..."
            placeholderTextColor={colors.subtitle}
            value={localQuery}
            onChangeText={handleSearchChange}
            onSubmitEditing={onSearch}
            returnKeyType="search"
          />
          {localQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setLocalQuery(""); setSearchQuery(""); setSuggestions([]); }}>
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
                key={`${item.id}-${index}`}
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
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  /* --- Single mode --- */
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
  /* --- Dual mode card --- */
  dualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    gap: 8,
  },
  dualBackBtn: {
    padding: 8,
  },
  dualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  iconColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  verticalDottedLine: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  dualDotOrigin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#6b7280',
    backgroundColor: 'transparent',
  },
  dualDivider: {
    height: 1,
    marginLeft: 0,
    marginRight: 0,
    opacity: 0.5,
  },
  dualInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  swapBtn: {
    padding: 8,
  },
  dotConnectorDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  /* --- Suggestions --- */
  suggestionsContainer: {
    marginTop: 10,
    borderRadius: 20,
    maxHeight: 300,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    overflow: 'hidden',
    marginLeft: 8,
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
