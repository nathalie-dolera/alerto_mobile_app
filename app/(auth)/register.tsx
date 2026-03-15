import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { RoundedInput } from '@/components/ui/rounded-input';
import { SocialButton } from '@/components/ui/social-button';
import { Colors } from '@/constants/color';
import { validateRegistration } from '@/utils/validation';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';


export default function RegistrationScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = (colorScheme ?? 'light') as 'light' | 'dark';
  const colors = Colors[theme];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRegistration = () => {
    const validation = validateRegistration(password, confirmPassword);
    if (!validation.isValid) {
      alert(validation.message); 
      return;
    }
    alert("Account Created!");
    router.replace('/'); 
  };
  
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.container}>
        
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backButton} 
        >
          <IconSymbol 
            name="ionicons.fill" 
            size={40} 
            color={colors.eyeIcon}
          />
        </TouchableOpacity>

        <View style={styles.content}>
        <ThemedText type="title"
            style={styles.title}>
            Create an Account
        </ThemedText>
        <ThemedText type="subtitle"
            style={[styles.subtitle, {color: colors.subtitle}]}>
            Fill in your details to get started    
        </ThemedText>
        
        <ThemedText style={styles.label}>Email Address</ThemedText>
            <RoundedInput
              placeholder="name@example.com"
              value={email}
              onChangeText={setEmail}
              leftIcon={{ name: "feather.fill" }}
            />
        
        <ThemedText style={styles.label}>Password</ThemedText>
            <RoundedInput
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                leftIcon={{ name: "evilcons.fill"}}
                rightIcon={
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <IconSymbol 
                        name={showPassword ? 'eye' : 'eye-off'} 
                        size={20} 
                        color={colors.eyeIcon} 
                        />
                    </TouchableOpacity>
                }
            />
        <ThemedText style={styles.label}>Confirm Password</ThemedText>
                <RoundedInput
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    leftIcon={{ name: "evilcons.fill" }}
                    rightIcon={
                        <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                            <IconSymbol
                                name={showConfirmPassword ? 'eye' : 'eye-off'}
                                size={20}
                                color={colors.eyeIcon}
                            />
                        </TouchableOpacity>
                    }
                />
        <View style={styles.signUpWrap}>
            <PrimaryButton onPress={handleRegistration}>SignUp</PrimaryButton>

        </View>
            <View style={styles.dividerRow}>
                <View style={[styles.hr, {backgroundColor: colors.hr}]} />
                <ThemedText style={styles.or}>Or continue with</ThemedText>
                <View style={[styles.hr, {backgroundColor: colors.hr}]} />
            </View>
    
            <View style={styles.socialRow}>
                <SocialButton onPress={() => {}}>
                <IconSymbol name="google.fill" size={16} color="#fff" />
                <ThemedText type="buttonLabel" style={[styles.socialText, { color: '#fff' }]}>Google</ThemedText>
                </SocialButton>
    
                <SocialButton onPress={() => {}}>
                <IconSymbol name="ant-design.fill" size={20} color="#fff" />
                <ThemedText style={[styles.socialText, { color: '#fff' }]}>Apple</ThemedText>
                </SocialButton>
            </View>

            <View style={styles.loginRow}>
                <ThemedText>
                Already have an account?
                    <ThemedText
                    type="link" onPress={() => router.push('/login')}>
                    {''} Log in
                    </ThemedText>
                </ThemedText>
            </View> 

        </View>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  backButton: {
    marginTop: 50, 
    width: 50,
    height: 50,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginBottom: 50,
    justifyContent: 'center',
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',

  },
  subtitle: {
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginTop: 12,
    fontWeight: '600',
  },
   signUpWrap: {
    marginTop: 50,
  },
    dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
  },
    hr: {
    flex: 1,
    height: 1,
  },
  or: {
    marginHorizontal: 20,
  },
    socialRow: {
    flexDirection: 'row',
    marginTop: 30,
    justifyContent: 'space-between',
  },
    socialText: {
    marginLeft: 8,
  },
  loginRow: {
    marginTop: 22,
    alignItems: 'center',
  }
});