import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import { RoundedInput } from '@/components/ui/rounded-input';
import { SocialButton } from '@/components/ui/social-button';
import { Colors } from '@/constants/color';
import { useLoginLogic } from '@/hooks/use-login-logic';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();  
  const theme = (useColorScheme() ?? 'light') as 'light' | 'dark'; 
  const colors = Colors[theme]; 
  const {handleEmailLogin, onGooglePress } = useLoginLogic();
 

  return (
    <>
    {/* Use to remove header like the navigation in expo app*/}
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
          </View>
        </View>

      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Welcome Back
        </ThemedText>
        <ThemedText type="subtitle" style={[styles.subtitle, { color: colors.subtitle}]}>
          Please log in to your account to continue
        </ThemedText>

        <ThemedText style={styles.label}>Email</ThemedText>
          <RoundedInput 
            placeholder="Enter your email address" 
            value={email} 
            onChangeText={setEmail} 
            leftIcon={{ name: 'feather.fill' }}  
            />

        <ThemedText style={[styles.label, { marginTop: 16 }]}>Password</ThemedText>
        <RoundedInput 
          placeholder="Enter your password" 
          value={password} 
          onChangeText={setPassword} 
          secureTextEntry={!showPassword} 
          leftIcon={{ name: 'evilcons.fill' }} 
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

        <TouchableOpacity 
            style={styles.forgot} 
            onPress={() => {router.push('/forgot-pass')}}>
          <ThemedText type="link">Forgot Password?</ThemedText>
        </TouchableOpacity>

        <View style={styles.loginWrap}>
          <PrimaryButton 
            onPress={() => handleEmailLogin(email, password)}
              >Login
          </PrimaryButton>
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.hr, {backgroundColor: colors.hr}]} />
          <ThemedText style={styles.or}>Or continue with</ThemedText>
          <View style={[styles.hr, {backgroundColor: colors.hr}]} />
        </View>

        <View style={styles.socialRow}>
          <SocialButton onPress={onGooglePress}>
            <IconSymbol name="google.fill" size={16} color="#fff" />
            <ThemedText type="buttonLabel" style={[styles.socialText, { color: '#fff' }]}>Google</ThemedText>
          </SocialButton>
        </View>

        <View style={styles.signupRow}>
          <ThemedText>
            Don&apos;t have an account? 
              <ThemedText 
                type="link"
                onPress={() => router.push('/register')}
              >
              {''} Sign Up
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
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 90,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: {
    marginTop: 18,
  },
  title: {
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '700',
    marginTop: 18,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 25,
    textAlign: 'center',
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  loginWrap: {
    marginTop: 18,
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
  signupRow: {
    marginTop: 22,
    alignItems: 'center',
  },
});