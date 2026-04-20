import { Colors } from '@/constants/color';
import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { ThemedText } from '../themed-text';
import { IconSymbol } from './icon-symbol';
import { ModalContainer } from './modal-container';

export interface CustomAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: CustomAlertButton[];
  onClose: () => void;
  icon?: React.ComponentProps<typeof IconSymbol>['name'];
  iconColor?: string;
}

export function CustomAlertModal({
  visible,
  title,
  message,
  buttons = [],
  onClose,
  icon,
  iconColor
}: CustomAlertModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const internalButtons = buttons.length > 0 ? buttons : [
    { text: "OK", onPress: onClose }
  ];

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <ModalContainer onClose={onClose}>
        <View style={styles.content}>
          {icon && (
            <View style={[styles.iconCircle, { backgroundColor: iconColor ? `${iconColor}20` : colors.modalIcon + '20' }]}>
              <IconSymbol name={icon} size={32} color={iconColor || colors.activeCard} />
            </View>
          )}

          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>

          <ThemedText style={[styles.message, { color: colors.subtitle }]}>
            {message}
          </ThemedText>

          <View style={styles.buttonContainer}>
            {internalButtons.map((btn, index) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';

              const buttonTextProps = {
                color: isDestructive ? colors.logoutText : isCancel ? colors.subtitle : colors.activeText,
                weight: isCancel ? '600' : 'bold'
              };

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    isCancel ? [styles.cancelButton, { borderColor: colors.hr }] : { backgroundColor: isDestructive ? colors.dangerBg : colors.activeCard },
                    internalButtons.length > 1 && { flex: 1 }
                  ]}
                  onPress={() => {
                    if (btn.onPress) btn.onPress();
                    onClose();
                  }}
                >
                  <ThemedText style={{ color: buttonTextProps.color, fontWeight: buttonTextProps.weight as any }}>
                    {btn.text}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ModalContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingTop: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    gap: 12,
  },
  button: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    minWidth: 100,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
});
