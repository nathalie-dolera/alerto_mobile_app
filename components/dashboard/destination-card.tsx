import { StyleSheet, TouchableOpacity, type TouchableOpacityProps } from 'react-native';

export function DestinationCard({ children, style, ...props }: TouchableOpacityProps) {
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
    borderRadius: 20,
    padding: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
});