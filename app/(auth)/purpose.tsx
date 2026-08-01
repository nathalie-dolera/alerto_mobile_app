import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PurposeScreen() {
  const [selectedPurpose, setSelectedPurpose] = useState<'commuter' | 'driver' | null>('commuter');
  const router = useRouter();  
  const theme = (useColorScheme() ?? 'light') as 'light' | 'dark'; 
  const colors = Colors[theme]; 
  const { updateUser } = useAuth();

  const handleContinue = async () => {
    if (selectedPurpose) {
      await updateUser({ purpose: selectedPurpose });
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Image 
            source={require('@/assets/images/alerto_logo1.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <ThemedText style={[styles.title, { color: colors.mainText }]}>
          Commuter Safety Portal
        </ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          Secure your ride and arrive safely with Alerto
        </ThemedText>

        <View 
          style={[
            styles.card, 
            { borderColor: colors.purposeSelectedBorder, backgroundColor: colors.purposeSelectedBg }
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.purposeSelectedBorder }]}>
              <IconSymbol name="location-sharp" size={24} color="#fff" />
            </View>
            <View style={styles.cardHeaderRight}>
              <ThemedText style={[styles.cardTitle, { color: colors.text }]}>Commuter</ThemedText>
              <IconSymbol name="checkmark.circle.fill" size={20} color={colors.purposeSelectedBorder} />
            </View>
          </View>
          <ThemedText type="subtitle" style={styles.cardSubtitle}>
            Secure your ride and arrive safely.
          </ThemedText>

          <View style={styles.featureList}>
            <View style={styles.featureRow}>
              <IconSymbol name="vibrate" size={16} color={colors.brand} />
              <ThemedText style={[styles.featureText, { color: colors.subtitle }]}>Wake-up vibrations & alerts</ThemedText>
            </View>
            <View style={styles.featureRow}>
              <IconSymbol name="car.fill" size={16} color={colors.brand} />
              <ThemedText style={[styles.featureText, { color: colors.subtitle }]}>AI Grab assist</ThemedText>
            </View>
            <View style={styles.featureRow}>
              <IconSymbol name="shield-alert" size={16} color={colors.brand} />
              <ThemedText style={[styles.featureText, { color: colors.subtitle }]}>Anti-theft & safe arrival verification</ThemedText>
            </View>
            <View style={styles.featureRow}>
              <IconSymbol name="map" size={16} color={colors.brand} />
              <ThemedText style={[styles.featureText, { color: colors.subtitle }]}>Live risk heat maps</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity 
          style={[styles.continueButton, { backgroundColor: colors.brand }]} 
          onPress={handleContinue}
        >
          <ThemedText style={[styles.continueButtonText, { color: '#fff' }]}>Continue</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 24,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  logoImage: {
    height: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 'normal',
    textAlign: 'center',
    marginBottom: 20,
  },  
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 10,
  },
  cardSelected: {
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  iconContainerSelected: {
  },
  cardHeaderRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    marginLeft: 64,
  },
  featureList: {
    marginLeft: 64,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  continueButton: {
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  continueButtonDisabled: {
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
