import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

export function SocialButton({ children, style, ...props }: any) {
  const backgroundColor = useThemeColor({}, 'buttonBackground');
  const borderColor = useThemeColor({}, 'avatarBorder');

  return (
    <TouchableOpacity 
      style={[
        styles.btn, 
        { backgroundColor, borderColor }, 
        style
      ]} 
    >
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    borderWidth: 1, 
  },
});