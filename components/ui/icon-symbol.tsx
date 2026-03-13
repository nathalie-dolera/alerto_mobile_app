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
  'ant-design.fill': 'apple',
  'google.fill': 'google',  
  'ionicons.fill': 'chevron-left',
};

export function IconSymbol({ name, size = 24, color, style }: { name: keyof typeof MAPPING | string; size?: number; color: string | OpaqueColorValue; style?: StyleProp<TextStyle>; }) {
  const mapped = MAPPING[name] ?? 'help-circle';
  return <MaterialCommunityIcons color={color as string} size={size} name={mapped as ComponentProps<typeof MaterialCommunityIcons>['name']} style={style} />;
}