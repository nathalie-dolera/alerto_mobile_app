import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MonitoringAnalytics {
  snoreEvents: number;
  antiTheftEvents: number;
  lastSnoreEventAt: number | null;
  lastAntiTheftEventAt: number | null;
}

const DEFAULT_ANALYTICS: MonitoringAnalytics = {
  snoreEvents: 0,
  antiTheftEvents: 0,
  lastSnoreEventAt: null,
  lastAntiTheftEventAt: null,
};

function getAnalyticsKey(userId?: string | null) {
  return `alerto_monitoring_analytics_${userId || 'guest'}`;
}

async function getAnalytics(userId?: string | null): Promise<MonitoringAnalytics> {
  const saved = await AsyncStorage.getItem(getAnalyticsKey(userId));

  if (!saved) {
    return DEFAULT_ANALYTICS;
  }

  return {
    ...DEFAULT_ANALYTICS,
    ...JSON.parse(saved),
  };
}

async function saveAnalytics(userId: string | null | undefined, analytics: MonitoringAnalytics) {
  await AsyncStorage.setItem(getAnalyticsKey(userId), JSON.stringify(analytics));
}

export const MonitoringAnalyticsService = {
  async get(userId?: string | null) {
    return getAnalytics(userId);
  },

  async recordSnoreEvent(userId?: string | null) {
    const analytics = await getAnalytics(userId);
    await saveAnalytics(userId, {
      ...analytics,
      snoreEvents: analytics.snoreEvents + 1,
      lastSnoreEventAt: Date.now(),
    });
  },

  async recordAntiTheftEvent(userId?: string | null) {
    const analytics = await getAnalytics(userId);
    await saveAnalytics(userId, {
      ...analytics,
      antiTheftEvents: analytics.antiTheftEvents + 1,
      lastAntiTheftEventAt: Date.now(),
    });
  },
};
