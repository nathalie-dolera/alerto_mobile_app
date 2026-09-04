import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MonitoringAnalytics {
  antiTheftEvents: number;
  lastAntiTheftEventAt: number | null;
}

const DEFAULT_ANALYTICS: MonitoringAnalytics = {
  antiTheftEvents: 0,
  lastAntiTheftEventAt: null,
};

function getAnalyticsKey(userId?: string | null) {
  return `alerto_monitoring_analytics_${userId || 'guest'}`;
}

const COMMON_KEY = 'alerto_monitoring_analytics_common';

async function getAnalytics(userId?: string | null): Promise<MonitoringAnalytics> {
  const userKey = getAnalyticsKey(userId);
  const saved = await AsyncStorage.getItem(userKey);

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_ANALYTICS,
        ...parsed,
      };
    } catch {
      // Fallback
    }
  }

  // Check fallback common key
  const commonSaved = await AsyncStorage.getItem(COMMON_KEY);
  if (commonSaved) {
    try {
      const parsed = JSON.parse(commonSaved);
      return {
        ...DEFAULT_ANALYTICS,
        ...parsed,
      };
    } catch {
      // Fallback
    }
  }

  return DEFAULT_ANALYTICS;
}

async function saveAnalytics(userId: string | null | undefined, analytics: MonitoringAnalytics) {
  const payload = JSON.stringify(analytics);
  await AsyncStorage.setItem(getAnalyticsKey(userId), payload);
  await AsyncStorage.setItem(COMMON_KEY, payload);
}

export const MonitoringAnalyticsService = {
  async get(userId?: string | null) {
    return getAnalytics(userId);
  },

  async recordAntiTheftEvent(userId?: string | null) {
    const analytics = await getAnalytics(userId);
    const updated: MonitoringAnalytics = {
      ...analytics,
      antiTheftEvents: (analytics.antiTheftEvents || 0) + 1,
      lastAntiTheftEventAt: Date.now(),
    };
    await saveAnalytics(userId, updated);
    return updated;
  },
};
