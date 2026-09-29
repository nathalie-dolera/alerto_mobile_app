import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const SENDGRID_API_KEY = process.env.EXPO_PUBLIC_SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.EXPO_PUBLIC_SENDGRID_FROM_EMAIL || 'alerto.system2026@gmail.com';
const DEVICE_ID_KEY = '@alerto_device_id';

/**
 * Generates or retrieves a persistent device fingerprint for this phone.
 * Combines platform info + a random UUID stored in AsyncStorage.
 */
async function getDeviceId(): Promise<string> {
  let storedId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!storedId) {
    storedId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, storedId);
  }
  return storedId;
}

/**
 * Gets a human-readable device description
 */
function getDeviceDescription(): string {
  const os = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const version = Platform.Version;
  const appVersion = Application.nativeApplicationVersion || 'Unknown';
  return `${os} ${version} · Alerto v${appVersion}`;
}

export const LoginAlertService = {
  /**
   * Returns true if the current device is different from the last known device
   * for this user email. Also returns true on first-ever login (no known device).
   */
  async isNewDevice(email: string): Promise<boolean> {
    try {
      const currentDeviceId = await getDeviceId();
      const knownDeviceKey = `@alerto_known_device_${email.trim().toLowerCase()}`;
      const lastKnownDeviceId = await AsyncStorage.getItem(knownDeviceKey);

      // First login ever on this app = no stored device → it IS a new device
      if (!lastKnownDeviceId) return true;
      // Different device
      return lastKnownDeviceId !== currentDeviceId;
    } catch {
      return false; // On error, don't block login
    }
  },

  /**
   * Marks the current device as trusted for the given email.
   * Called after successful OTP verification.
   */
  async markDeviceTrusted(email: string): Promise<void> {
    try {
      const currentDeviceId = await getDeviceId();
      const knownDeviceKey = `@alerto_known_device_${email.trim().toLowerCase()}`;
      await AsyncStorage.setItem(knownDeviceKey, currentDeviceId);
    } catch (err) {
      console.warn('[LoginAlertService] Failed to save trusted device:', err);
    }
  },

  /**
   * Public getter for device description string
   */
  getDeviceInfo(): string {
    return getDeviceDescription();
  },

  /**
   * Legacy method — checks if new device and sends alert (non-blocking).
   * Still used if you want alert-only behavior.
   */
  async checkAndAlert(userEmail: string, userName: string): Promise<void> {
    try {
      const isNew = await this.isNewDevice(userEmail);
      if (isNew) {
        await this.sendNewDeviceAlert(userEmail.trim(), userName.trim(), getDeviceDescription());
      }
      await this.markDeviceTrusted(userEmail);
    } catch (err) {
      console.warn('[LoginAlertService] Failed to check device:', err);
    }
  },

  /**
   * Dispatches a "New Login Detected" security alert email via SendGrid
   */
  async sendNewDeviceAlert(email: string, name: string, deviceInfo: string): Promise<void> {
    if (!SENDGRID_API_KEY) {
      console.warn('[LoginAlertService] No SendGrid API key configured, skipping alert.');
      return;
    }

    const loginTime = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #0b1723; padding: 28px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 2px;">ALERTO</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; letter-spacing: 0.5px;">SMART PERSONAL SAFETY SYSTEM</p>
        </div>
        
        <div style="padding: 32px 28px; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: inline-block; width: 56px; height: 56px; border-radius: 50%; background-color: #fef3c7; line-height: 56px; text-align: center; font-size: 28px;">⚠️</div>
          </div>
          
          <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a; text-align: center;">New Login Detected</h2>
          
          <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #64748b; text-align: center;">
            Hello <strong style="color: #0f172a;">${name || 'User'}</strong>,<br/>
            Your Alerto account was just signed into from a new device. This login was verified via email OTP.
          </p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">📱 Device</td>
                <td style="padding: 8px 0; color: #0f172a; text-align: right; font-weight: 600;">${deviceInfo}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">🕐 Time</td>
                <td style="padding: 8px 0; color: #0f172a; text-align: right; font-weight: 600;">${loginTime}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">📧 Account</td>
                <td style="padding: 8px 0; color: #0f172a; text-align: right; font-weight: 600;">${email}</td>
              </tr>
            </table>
          </div>
          
          <p style="margin: 0; font-size: 13px; color: #64748b; text-align: center; line-height: 1.6;">
            If this was you, no action is needed.<br/>
            If you didn't sign in, please change your password immediately.
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
          &copy; ${new Date().getFullYear()} Alerto System. Protecting your daily journeys.
        </div>
      </div>
    `;

    try {
      const response = await fetch(SENDGRID_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email }],
              subject: '🔒 [Alerto] New Login Detected on a Different Device',
            },
          ],
          from: {
            email: SENDGRID_FROM_EMAIL,
            name: 'Alerto Security',
          },
          content: [
            {
              type: 'text/html',
              value: emailHtml,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.warn('[LoginAlertService] SendGrid error:', response.status);
      } else {
        console.log(`[LoginAlertService] Security alert sent to ${email}`);
      }
    } catch (err) {
      console.warn('[LoginAlertService] Failed to send alert email:', err);
    }
  },
};
