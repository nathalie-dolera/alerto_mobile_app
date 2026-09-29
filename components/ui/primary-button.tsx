import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

interface PrimaryButtonProps extends TouchableOpacityProps {
  loading?: boolean;
}

export function PrimaryButton({ children, style, loading = false, disabled, ...props }: Readonly<PrimaryButtonProps>) {
  const bg = '#4756d6';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: bg, opacity: disabled || loading ? 0.75 : 1 },
        style,
      ]}
      activeOpacity={0.85}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        typeof children === 'string' ? <Text style={styles.text}>{children}</Text> : children
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#243b8a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
