import AsyncStorage from '@react-native-async-storage/async-storage';

export const SMS_LOAD_KEY = 'alerto_sms_load_config_v3';

export interface SmsLoadConfig {
  loadType: 'regular' | 'promo';
  regularAmount?: number;
  promoIsUnli?: boolean;
  promoTotalSms?: number;
  promoValidityDays?: number;
  startDate: string;
  expirationDate: string;
  baselineSmsSent: number;
  lastHardwareSmsCount?: number;
  usedSmsCount?: number;
}

export const SmsLoadService = {
  async getLoadConfig(): Promise<SmsLoadConfig | null> {
    try {
      const raw = await AsyncStorage.getItem(SMS_LOAD_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SmsLoadConfig;
    } catch (err) {
      console.error('[SmsLoadService] Error loading SMS config:', err);
      return null;
    }
  },

  async saveLoadConfig(config: SmsLoadConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(SMS_LOAD_KEY, JSON.stringify(config));
    } catch (err) {
      console.error('[SmsLoadService] Error saving SMS config:', err);
    }
  },

  async recordSmsSent(count: number = 1): Promise<void> {
    try {
      const current = await this.getLoadConfig();
      if (!current) return;
      const currentUsed = current.usedSmsCount || 0;
      const updated: SmsLoadConfig = {
        ...current,
        usedSmsCount: currentUsed + count,
      };
      await this.saveLoadConfig(updated);
      console.log(`[SmsLoadService] Recorded ${count} SMS sent. Total used: ${updated.usedSmsCount}`);
    } catch (err) {
      console.error('[SmsLoadService] Error recording SMS sent:', err);
    }
  },
};
