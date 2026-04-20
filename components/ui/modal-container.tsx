import { BlurView } from 'expo-blur';
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, TouchableOpacity, useColorScheme, View } from "react-native";
import { ThemedView } from "../themed-view";

interface ModalContainerProps {
    children: React.ReactNode;
    onClose?: () => void;
}

export function ModalContainer({ children, onClose }: ModalContainerProps) {
    const router = useRouter();
    const theme = useColorScheme();

    return (
        <View style={styles.overlay}>
            <TouchableOpacity
                style={StyleSheet.absoluteFillObject}
                activeOpacity={1}
                onPress={() => onClose ? onClose() : router.back()}>
                <BlurView intensity={25} style={StyleSheet.absoluteFillObject} />
            </TouchableOpacity>
        
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.centeredView}>
                    <ThemedView 
                        style={styles.modalCard}>
                        {children}
                    </ThemedView>
            </KeyboardAvoidingView>


        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    centeredView: {
        width: '90%',
    },
    modalCard: {
        borderRadius: 30,
        padding: 25,
        shadowColor: '#000',
    },
});