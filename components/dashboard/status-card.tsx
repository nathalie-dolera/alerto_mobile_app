import { StyleSheet, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

export function StatusCard({ children, style, ...props }: TouchableOpacityProps) {
  return (
    <TouchableOpacity 
      style={[styles.card, style]} 
      activeOpacity={0.85} 
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#3b4fb0',
    borderRadius: 15,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
});