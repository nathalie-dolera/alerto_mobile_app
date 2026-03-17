import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

export function SocialButton({ children, style, ...props }: any) {
  const backgroundColor = '#0b1723';
  const borderColor = 'rgba(255,255,255,0.06)';

  return (
    <TouchableOpacity 
      style={[
        styles.btn, 
        { backgroundColor, borderColor }, 
        style
      ]} 
      {...props}
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