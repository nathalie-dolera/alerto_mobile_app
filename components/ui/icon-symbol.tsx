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
  'bookmark': 'bookmark',
  'content-save': 'content-save',
  'check': 'check',
  'check-circle': 'check-circle',
  'vibrate': 'vibrate',  
  'trash.fill': 'delete',   
  'plus': 'plus',
  'star.fill':   'star-outline',
  'alert-outline': 'alert-outline',
  'satellite-variant': 'satellite-variant',
  'chart-bar': 'chart-bar',
  'shield-alert': 'shield-alert',
  'sparkles': 'auto-fix',
  'photo.fill': 'image',
  'car.fill': 'car',
  'barcode': 'barcode',
  'checkmark.circle.fill': 'check-circle',
  'pencil': 'pencil',
  'trash': 'delete',
  'person.crop.circle.badge.plus': 'account-plus',
  'xmark': 'close',
  'applewatch': 'watch',
  'location.fill': 'map-marker',
  'link.badge.plus': 'link-plus',
  'circle': 'circle-outline',
  'bluetooth-off': 'bluetooth-off',
  'person.3.fill': 'account-group',
  'cloud-alert': 'cloud-alert',
  'cloud-off-outline': 'cloud-off-outline',
  'alert-circle-outline': 'alert-circle-outline',
  'account-alert': 'account-alert',
  'car.2.fill': 'car-info'
};

export function IconSymbol({ name, size = 24, color, style }: { name: keyof typeof MAPPING | string; size?: number; color: string | OpaqueColorValue; style?: StyleProp<TextStyle>; }) {
  const mapped = MAPPING[name] ?? 'help-circle';
  return <MaterialCommunityIcons color={color as string} size={size} name={mapped as ComponentProps<typeof MaterialCommunityIcons>['name']} style={style} />;
}