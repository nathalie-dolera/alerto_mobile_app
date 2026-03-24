import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';

export function StatusCard({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.cardContainer, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
});
