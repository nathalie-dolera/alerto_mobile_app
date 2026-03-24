import React from 'react';
import { View, StyleSheet } from 'react-native';

interface ProgressBarProps {
  progress: number; 
  triggerRatio?: number; 
}

export function ProgressBar({ progress, triggerRatio = 0.75 }: ProgressBarProps) {
  return (
    <View style={styles.barBackground}>
      <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      <View style={[styles.triggerIndicator, { right: `${(1 - triggerRatio) * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  barBackground: {
    height: 12,
    backgroundColor: '#dae6f5',
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#091432', 
    width: '100%',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#96C0FF',
    borderRadius: 6,
  },
  triggerIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#f30f0f', 
  },
});
