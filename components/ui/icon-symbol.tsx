import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<string, string>;

const MAPPING: IconMapping = {
  'house.fill': 'home',
  'feather.fill': 'email', 
  'evilcons.fill': 'lock',
  'eye': 'eye',
  'eye-off': 'eye-off',
  'google.fill': 'google',  
  'ionicons.fill': 'chevron-left',
  'entypo.fill': 'shield-lock',
  'attach-email': 'email-check-outline',
  'clock.fill': 'clock',
  'gearshaper.fill': 'cog',
  'person.fill': 'account',
  'magnifyingglass': 'magnify',
  'bluetooth': 'bluetooth',
  'location-sharp': 'map-marker',
  'add': 'plus',            
  'remove': 'minus',         
  'locate': 'crosshairs-gps', 
  'heart.fill': 'heart',
  'heart.outline': 'heart-outline',
  'clock.outline': 'clock-outline',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'star': 'star',
  'bell': 'bell',
  'moon': 'weather-night', 
  'watch': 'watch', 
  'lightning': 'lightning-bolt',
  'logout': 'logout',
};

export function IconSymbol({ name, size = 24, color, style }: { name: keyof typeof MAPPING | string; size?: number; color: string | OpaqueColorValue; style?: StyleProp<TextStyle>; }) {
  const mapped = MAPPING[name] ?? 'help-circle';
  return <MaterialCommunityIcons color={color as string} size={size} name={mapped as ComponentProps<typeof MaterialCommunityIcons>['name']} style={style} />;
}