import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

export function PrimaryButton({ children, style, ...props }: Readonly<TouchableOpacityProps>) {
  const bg = '#4756d6';

  return (
    <TouchableOpacity style={[styles.button, { backgroundColor: bg }, style]} activeOpacity={0.85} {...props}>
      <Text style={styles.text}>{children}</Text>
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
