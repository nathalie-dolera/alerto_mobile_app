import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';

interface QuickCardProps {
  title: string;
  iconName: string;
  isAdd?: boolean; 
  onPress?: () => void;
}

export function QuickCard({ title, iconName, isAdd = false, onPress }: QuickCardProps) {
  const theme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const colors = Colors[theme];
  const isDark = theme === 'dark'; 

  return (
    <TouchableOpacity 
      style={[
        styles.gridCard, 
        !isAdd && { backgroundColor: theme === 'light' ? '#E8EFFF' : colors.buttonBackground },
        isAdd && [styles.dashedCard, { borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : colors.mainText }]
      ]} 
      onPress={onPress}
    >
      <View style={[
          isAdd ? styles.addCircle : styles.iconCircleSmall,
          { 
              backgroundColor: isAdd 
                  ? (isDark ? 'rgba(255, 255, 255, 0.15)' : colors.mainText) 
                  : (isDark ? 'rgba(255, 255, 255, 0.15)' : colors.background) 
          }
      ]}>
        <IconSymbol 
          name={iconName as any} 
          size={24} 
          color={isAdd ? (isDark ? colors.mainText : colors.background) : colors.mainText} 
        />
      </View>

      <ThemedText 
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
            styles.cardText, 
            { color: isAdd ? (isDark ? colors.subtitle : colors.icon) : colors.mainText },
            { textAlign: 'center', width: '100%' }
        ]}
      >
        {title}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
    gridCard: {
        width: '48%',
        height: 105,
        borderRadius: 16,
        padding: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    dashedCard: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderStyle: 'dashed',
    },
    iconCircleSmall: {
        width: 44, 
        height: 44, 
        borderRadius: 22, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 8,
    },
    addCircle: {
        width: 44, 
        height: 44, 
        borderRadius: 22, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 8,
    },
    cardText: { 
        fontSize: 14, 
        fontWeight: '700', 
    },
});