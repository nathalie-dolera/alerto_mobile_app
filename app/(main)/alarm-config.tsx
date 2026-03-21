import { TabButton } from "@/components/alarm-config/tab-button";
import { ToggleCard } from "@/components/alarm-config/toggle-card";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/color";
import { intensity_set, IntensityLevel, useAlarmConfig } from '@/hooks/use-alarm-config';
import Slider from '@react-native-community/slider';
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from "react-native";

export default function AlarmConfigScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const logic = useAlarmConfig();
  const distances = ['500m', '1km', '2km'];
  const intensityLevels: IntensityLevel[] = ['light', 'medium', 'hard'];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>

        <TouchableOpacity 
        onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text 
        style={[styles.headerTitle, 
        { color: colors.text }]}>
            Alarm Configuration
        </Text>
        <View style={{ width: 24 }} />
      </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Activation Distance
        </Text>
        <View style={[styles.tabsContainer, { backgroundColor: colors.configColor }]}>
        {distances.map((dist) => (
          <TabButton 
            key={dist} 
            title={dist} 
            isActive={logic.distance === dist} 
            onPress={() => logic.setDistance(dist)} 
            colors={colors} 
          />
        ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Vibration Intensity
        </Text>
        <View>
            {intensityLevels.map((level) => {
            const data = intensity_set[level];
            return (
                <ToggleCard 
                key={level}
                title={data.title}
                subtitle={data.subtitle}
                iconName="vibrate" 
                isActive={logic.intensity === level}
                onPress={() => logic.setIntensity(level)}
                colors={colors}
                />
            );
            })}
        </View>

        <View style={styles.durationHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>
                Shake Duration
            </Text>
            <Text style={[styles.durationValue, { color: colors.lightning }]}>{logic.duration}
                s
            </Text>
        </View>

        <View style={[styles.sliderCard, { backgroundColor: colors.configColor}]}>
            <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={logic.currentConfig.minDuration}
            maximumValue={logic.currentConfig.maxDuration}
            step={1}
            value={logic.duration}
            onValueChange={logic.setDuration}
            minimumTrackTintColor={colors.activeCard}
            maximumTrackTintColor={colors.hr}
            thumbTintColor={colors.primaryIcon}
            />
            <View style={styles.sliderLabels}>
            <Text style={{ color: colors.subtitle, fontSize: 12 }}>{logic.currentConfig.minDuration}
                s
            </Text>
            <Text style={{ color: colors.subtitle, fontSize: 12 }}>{logic.currentConfig.maxDuration}
                s
            </Text>
            </View>
      </View>

      <TouchableOpacity 
        style={[styles.checkboxContainer, { backgroundColor: colors.modalThanks }]} 
        onPress={() => logic.setSaveSettings(!logic.saveSettings)}
        activeOpacity={0.8}
      >
        <View style={[styles.checkboxIconBox, { backgroundColor: 'transparent' }]}>
          <IconSymbol name="content-save" size={18} color={colors.activeCard} />
        </View>
        <Text style={[styles.checkboxText, { color: colors.text}]}>
          Save Settings for future use
        </Text>
        <View style={[styles.checkbox, logic.saveSettings && { borderWidth: 0, backgroundColor: colors.activeCard }]}>
          {logic.saveSettings && <IconSymbol name="check" size={14} color={colors.activeText} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.saveBtn, { backgroundColor: colors.activeCard }]} 
        onPress={logic.handleSave}
        activeOpacity={0.8}
      >
        <IconSymbol name="check-circle" size={20} color={colors.activeText} />
        <Text style={[styles.saveBtnText, { color: colors.activeText }]}>
            Save Alarm
        </Text>
      </TouchableOpacity>


    </ScrollView>
  )
}

const styles = StyleSheet.create ({
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 50
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold'
    }, 
    sectionTitle: {
        fontSize: 16, 
        fontWeight: 'bold',
        marginTop: 15, 
        marginBottom: 10
    },
    tabsContainer: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 4
    },
    durationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 15
    },
    durationValue: {
        fontWeight: 'bold',
        fontSize: 16
    },
    sliderCard: {
        borderRadius: 20,
        padding: 12,
        marginTop: 5

    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 5,
        paddingHorizontal: 10
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginTop: 20
    },
    checkboxIconBox: {
        padding: 6, 
        borderRadius: 8, 
        marginRight: 12
    },
    checkboxText: {
        flex: 1,
        color: '#ffffff', 
        fontSize: 15, 
        fontWeight: '500'
    },
    checkbox: {
        width: 22, 
        height: 22, 
        backgroundColor: '#ffffff', 
        borderRadius: 4, 
        justifyContent: 'center', 
        alignItems: 'center'
    },
    saveBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: 8, 
        marginTop: 50, 
        height: 56, 
        borderRadius: 12 
    },
  saveBtnText: { 
    color: '#ffffff', 
    fontSize: 16, 
    fontWeight: 'bold' 
    }
})
