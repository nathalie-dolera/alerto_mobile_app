import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

interface SocialButtonProps extends TouchableOpacityProps {
  loading?: boolean;
}

export function SocialButton({ children, style, loading = false, disabled, ...props }: Readonly<SocialButtonProps>) {
  const backgroundColor = '#0b1723';
  const borderColor = 'rgba(255,255,255,0.06)';

  return (
    <TouchableOpacity 
      style={[
        styles.btn, 
        { backgroundColor, borderColor, opacity: disabled || loading ? 0.75 : 1 }, 
        style
      ]} 
      disabled={disabled || loading}
      activeOpacity={0.85}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        children
      )}
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