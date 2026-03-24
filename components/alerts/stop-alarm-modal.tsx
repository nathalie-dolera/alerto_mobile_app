import React from 'react';
import { View, StyleSheet, Modal, ModalProps } from 'react-native';

export function StopAlarmModal({ children, visible, ...props }: ModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" {...props}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(215, 222, 239, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#091432', 
    width: '85%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
});
