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

  return (
    <TouchableOpacity 
      style={[
        styles.gridCard, 
        !isAdd && { backgroundColor: theme === 'light' ? '#E8EFFF' : colors.buttonBackground },
        isAdd && [styles.dashedCard, { borderColor: colors.mainText }]
      ]} 
      onPress={onPress}
    >
      <View style={[
          isAdd ? styles.addCircle : styles.iconCircleSmall,
          { backgroundColor: isAdd ? colors.mainText : colors.background }
      ]}>
        <IconSymbol 
          name={iconName as any} 
          size={28} 
          color={isAdd ? colors.background : colors.mainText} 
        />
      </View>

      <ThemedText 
        style={[
            styles.cardText, 
            { color: isAdd ? colors.icon : colors.mainText }
        ]}
      >
        {title}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
    gridCard: {
        width: '47%',
        aspectRatio: 1,
        borderRadius: 20,
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
    },
    dashedCard: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderStyle: 'dashed',
    },
    iconCircleSmall: {
        width: 60, 
        height: 60, 
        borderRadius: 30, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 12,
    },
    addCircle: {
        width: 50, 
        height: 50, 
        borderRadius: 25, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 12,
    },
    cardText: { 
        fontSize: 16, 
        fontWeight: '700', 
    },
});