import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import React from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

export function RoundedInput({ style, placeholder, secureTextEntry, leftIcon, rightIcon, ...props }: Readonly<TextInputProps & {
  leftIcon?: { name: string; color?: string } | null;
  rightIcon?: React.ReactNode | null;
  style?: StyleProp<ViewStyle>;
}>) {
  const backgroundColor = '#0b1723';
  const iconColor = '#9aa4b0';
  const borderColor = 'rgba(255,255,255,0.06)';

  return (
  <ThemedView style={[styles.wrapper, { backgroundColor, borderColor }, style]}>
      {leftIcon ? (
        <IconSymbol name={leftIcon.name} size={18} color={leftIcon.color ?? iconColor} />
      ) : null}

      <TextInput
        placeholder={placeholder}
        placeholderTextColor={'rgba(255,255,255,0.6)'}
        secureTextEntry={secureTextEntry}
        style={styles.input}
        {...props}
      />

  {rightIcon}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
  borderRadius: 14,
    gap: 12,
  borderWidth: 1,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 10,
  },
});
