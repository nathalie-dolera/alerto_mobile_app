import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Alert Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.warn('requestNotificationPermissions error:', error);
    return false;
  }
}

function removeRestrictedNotificationWords(text: string) {
  return (text || '').replace(/\bSOS\b/gi, 'Emergency Alert');
}

export async function sendLocalNotification(title: string, body: string, data?: any) {
  try {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Alert Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      } catch {
        // channel may already exist
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: removeRestrictedNotificationWords(title),
        body: removeRestrictedNotificationWords(body),
        data: data || {},
        sound: true,
      },
      trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
    });
  } catch (error) {
    console.warn('sendLocalNotification warning (safe ignored):', error);
  }
}
