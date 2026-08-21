import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/context/auth';
import { useHistoryContext, TripData } from '@/context/history-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MonitoringAnalytics, MonitoringAnalyticsService } from '@/services/monitoring-analytics';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Colors } from '@/constants/color';
import { Pressable, ScrollView, StyleSheet, Text, View, Alert, Image, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HistoryScreen() {
    const { tripHistory, deleteTrip, clearHistory } = useHistoryContext();
    const { user } = useAuth();
    const analyticsUserId = user?.id || user?._id;
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [monitoringAnalytics, setMonitoringAnalytics] = useState<MonitoringAnalytics>({
        antiTheftEvents: 0,
        lastAntiTheftEventAt: null,
    });

    const totalTrips = tripHistory.length;
    const totalAlerts = tripHistory.reduce((sum, trip) => sum + trip.alertsTriggeredCount, 0);

    const totalAnomalies = tripHistory.reduce((sum, trip) => sum + (trip.anomalyCount || 0), 0);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            MonitoringAnalyticsService.get(analyticsUserId).then((analytics) => {
                if (isActive) {
                    setMonitoringAnalytics(analytics);
                }
            });

            return () => {
                isActive = false;
            };
        }, [analyticsUserId])
    );

    const formatDuration = (ms: number) => {
        const totalSides = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSides / 60);
        const seconds = totalSides % 60;
        return `${minutes}m ${seconds}s`;
    };

    const formatDate = (dateMs: number) => {
        const date = new Date(dateMs);
        return date.toLocaleDateString();
    };

    const formatTime = (dateMs: number) => {
        const date = new Date(dateMs);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getAverageResponseTime = () => {
        const allResponses = tripHistory.flatMap(trip => trip.responseTimes || []);
        if (allResponses.length === 0) return 'N/A';
        const avgMs = allResponses.reduce((sum, val) => sum + val, 0) / allResponses.length;
        return `${(avgMs / 1000).toFixed(1)}s`;
    };

    const getTripAvgResponseTime = (trip: TripData) => {
        if (!trip.responseTimes || trip.responseTimes.length === 0) return 'N/A';
        const avgMs = trip.responseTimes.reduce((sum, val) => sum + val, 0) / trip.responseTimes.length;
        return `${(avgMs / 1000).toFixed(1)}s`;
    };

    const confirmClearAll = () => {
        Alert.alert(
            "Clear Activity History",
            "Are you sure you want to delete all activity history? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Clear All", style: "destructive", onPress: clearHistory }
            ]
        );
    };

    const appColors = Colors[isDark ? 'dark' : 'light'];
    
    // Some specific mapping since Colors might not have all historical tags exactly mapped
    const colors = {
        background: appColors.background,
        card: appColors.card,
        text: appColors.text,
        textSecondary: appColors.subtitle,
        border: appColors.hr,
        cardShadow: appColors.shadow,
        info: appColors.infoIcon,
        warning: appColors.warningIcon,
        danger: appColors.dangerIcon,
        success: appColors.successIcon,
        dangerBg: appColors.dangerBg,
        dangerBorder: appColors.dangerBorder,
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Analytics</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                
                <View style={styles.statsContainer}>
                    <View style={[styles.statCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
                        <IconSymbol name="locate" size={24} color={colors.info} />
                        <Text style={[styles.statValue, { color: colors.text }]}>{totalTrips}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Activities</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
                        <IconSymbol name="bell" size={24} color={colors.warning} />
                        <Text style={[styles.statValue, { color: colors.text }]}>{totalAlerts}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Alerts</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
                        <IconSymbol name="lightning" size={24} color={colors.warning} />
                        <Text style={[styles.statValue, { color: colors.text }]}>{getAverageResponseTime()}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg. Response Time</Text>
                    </View>

                    <View style={[styles.statCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
                        <IconSymbol name="shield-alert" size={24} color={colors.danger} />
                        <Text style={[styles.statValue, { color: colors.text }]}>{monitoringAnalytics.antiTheftEvents}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Anti-Theft Alerts</Text>
                    </View>
                </View>

                <View style={styles.historySection}>
                    <View style={styles.historyHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity History</Text>
                        {totalTrips > 0 && (
                            <Pressable onPress={confirmClearAll} style={[styles.clearBtn, { backgroundColor: colors.dangerBg }]}>
                                <IconSymbol name="trash.fill" size={16} color={colors.danger} />
                                <Text style={[styles.clearBtnText, { color: colors.danger }]}>Clear All</Text>
                            </Pressable>
                        )}
                    </View>
                    {totalTrips === 0 ? (
                        <View style={styles.emptyState}>
                            <IconSymbol name="clock.outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No activity history available yet.</Text>
                        </View>
                    ) : (
                        tripHistory.map(trip => {
                            if (trip.type === 'booking') {
                                const isFailed = trip.bookingStatus === 'failed' || trip.safetyStatus === 'Cancelled';
                                const cardColor = isFailed ? colors.danger : colors.info;

                                return (
                                    <View key={trip.id} style={[styles.tripCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow, borderLeftColor: cardColor }]}>
                                        <View style={[styles.tripHeader, { borderBottomColor: colors.border }]}>
                                            <View style={styles.tripTitleBlock}>
                                                <View style={styles.tripTitleRow}>
                                                    <IconSymbol name={isFailed ? "alert-circle" : "camera"} size={20} color={cardColor} />
                                                    <Text style={[styles.destinationText, { color: isFailed ? colors.danger : colors.text }]}>
                                                        {isFailed ? "Booking Alert Failed" : "Booking Screenshot Sent"}
                                                    </Text>
                                                </View>
                                                <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                                                    {formatDate(trip.date)} • {formatTime(trip.date)}
                                                </Text>
                                                {trip.sentTo ? (
                                                    <Text style={[styles.dateText, { color: colors.textSecondary, marginTop: 3, fontWeight: '600' }]} numberOfLines={1}>
                                                        Sent to: {trip.sentTo}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <Pressable onPress={() => deleteTrip(trip.id)} hitSlop={10}>
                                                <IconSymbol name="trash.fill" size={20} color={colors.danger} />
                                            </Pressable>
                                        </View>
                                        {trip.screenshotUrl ? (
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                onPress={() => setPreviewImage(trip.screenshotUrl!)}
                                                style={styles.bookingImageContainer}
                                            >
                                                <Image source={{ uri: trip.screenshotUrl }} style={styles.bookingImage} resizeMode="cover" />
                                                <View style={styles.tapToViewBadge}>
                                                    <IconSymbol name="eye" size={12} color="#fff" />
                                                    <Text style={styles.tapToViewText}>Tap to view</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ) : (
                                            <View style={[styles.bookingImageContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.border }]}>
                                                <IconSymbol name="camera" size={32} color={colors.textSecondary} />
                                                <Text style={[styles.tapToViewText, { color: colors.textSecondary, marginTop: 4 }]}>No image</Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            }

                            if (trip.type === 'anti_theft') {
                                return (
                                    <View key={trip.id} style={[styles.tripCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow, borderLeftColor: colors.danger }]}>
                                        <View style={[styles.tripHeader, { borderBottomColor: colors.border }]}>
                                            <View style={styles.tripTitleBlock}>
                                                <View style={styles.tripTitleRow}>
                                                    <IconSymbol name="shield-alert" size={20} color={colors.danger} />
                                                    <Text style={[styles.destinationText, { color: colors.danger }]}>Anti-Theft Intrusion Detected</Text>
                                                </View>
                                                <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                                                    {formatDate(trip.date)} • {formatTime(trip.date)}
                                                </Text>
                                            </View>
                                            <Pressable onPress={() => deleteTrip(trip.id)} hitSlop={10}>
                                                <IconSymbol name="trash.fill" size={20} color={colors.danger} />
                                            </Pressable>
                                        </View>
                                        <View style={styles.tripDetails}>
                                            <View style={styles.detailRow}>
                                                <IconSymbol name="location" size={16} color={colors.textSecondary} />
                                                <Text style={[styles.detailText, { color: colors.textSecondary }]}>Location: {trip.locationName || 'Unknown Location'}</Text>
                                            </View>
                                            {!!trip.anomalyTriggers?.length && (
                                                <View style={styles.detailRow}>
                                                    <IconSymbol name="alert-outline" size={16} color={colors.danger} />
                                                    <Text style={[styles.detailText, { color: colors.danger }]}>Trigger: {trip.anomalyTriggers.join(', ')}</Text>
                                                </View>
                                            )}
                                            <View style={[styles.detailRow, { marginTop: 4 }]}>
                                                <IconSymbol name="close-circle" size={16} color={colors.danger} />
                                                <Text style={[styles.detailText, { color: colors.danger }]}>Resolution: SOS Sent</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            }

                            return (
                                <View key={trip.id} style={[styles.tripCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow, borderLeftColor: colors.info }]}>
                                    <View style={[styles.tripHeader, { borderBottomColor: colors.border }]}>
                                        <View style={styles.tripTitleBlock}>
                                            <View style={styles.tripTitleRow}>
                                                <IconSymbol name="location-sharp" size={20} color={colors.success} />
                                                <Text style={[styles.destinationText, { color: colors.text }]}>{trip.destinationName || 'Commute Trip'}</Text>
                                            </View>
                                            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                                                {formatDate(trip.date)} • {formatTime(trip.date)}
                                            </Text>
                                        </View>
                                        
                                        <Pressable onPress={() => deleteTrip(trip.id)} hitSlop={10}>
                                            <IconSymbol name="trash.fill" size={20} color={colors.danger} />
                                        </Pressable>
                                    </View>

                                    <View style={styles.tripDetails}>
                                        <View style={styles.detailRow}>
                                            <IconSymbol name="clock.fill" size={16} color={colors.textSecondary} />
                                            <Text style={[styles.detailText, { color: colors.textSecondary }]}>Duration: {formatDuration(trip.durationMs)}</Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <IconSymbol name="bell" size={16} color={colors.textSecondary} />
                                            <Text style={[styles.detailText, { color: colors.textSecondary }]}>Alerts Triggered: {trip.alertsTriggeredCount}</Text>
                                        </View>
                                        {!!trip.anomalyCount && (
                                            <View style={styles.detailRow}>
                                                <IconSymbol name="pulse" size={16} color={colors.textSecondary} />
                                                <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                                                    Behavior Deviations: {trip.anomalyCount} ({trip.safetyStatus || 'Suspicious'})
                                                </Text>
                                            </View>
                                        )}

                                        {!!trip.anomalyTriggers?.length && (
                                            <View style={styles.hazardTagsContainer}>
                                                <Text style={[styles.detailText, { color: colors.textSecondary, marginBottom: 4 }]}>Deviation Triggers:</Text>
                                                <View style={styles.hazardTags}>
                                                    {trip.anomalyTriggers.map((trigger, index) => (
                                                        <View key={index} style={[styles.tag, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' }]}>
                                                            <IconSymbol name="alert-outline" size={14} color={colors.warning} style={{marginRight: 4}} />
                                                            <Text style={[styles.tagText, { color: colors.warning }]}>{trigger}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                        {trip.responseTimes && trip.responseTimes.length > 0 && (
                                            <View style={styles.detailRow}>
                                                <IconSymbol name="lightning" size={16} color={colors.textSecondary} />
                                                <Text style={[styles.detailText, { color: colors.textSecondary }]}>Response Time: {getTripAvgResponseTime(trip)}</Text>
                                            </View>
                                        )}

                                        {trip.unsafeZonesEncountered.length > 0 && (
                                            <View style={styles.hazardTagsContainer}>
                                                <Text style={[styles.detailText, { color: colors.textSecondary, marginBottom: 4 }]}>Hazards Encountered:</Text>
                                                <View style={styles.hazardTags}>
                                                    {trip.unsafeZonesEncountered.map((zone, index) => (
                                                        <View key={index} style={[styles.tag, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                                                            <IconSymbol name="alert-outline" size={14} color={colors.danger} style={{marginRight: 4}} />
                                                            <Text style={[styles.tagText, { color: colors.danger }]}>{zone}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

            </ScrollView>

            {/* Image Preview Modal */}
            <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setPreviewImage(null)}
                    style={styles.previewOverlay}
                >
                    <View style={styles.previewContainer}>
                        {previewImage && (
                            <Image source={{ uri: previewImage }} style={styles.previewFullImage} resizeMode="contain" />
                        )}
                        <TouchableOpacity onPress={() => setPreviewImage(null)} style={styles.previewCloseBtn}>
                            <IconSymbol name="close-circle" size={32} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    clearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 8,
        gap: 6
    },
    clearBtnText: {
        fontWeight: '600',
        fontSize: 14,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    statsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 25,
        gap: 12,
    },
    statCard: {
        width: '48%',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 8,
        textAlign: 'center'
    },
    statLabel: {
        fontSize: 12,
        marginTop: 4,
    },
    historySection: {
        marginTop: 10,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 50,
    },
    emptyText: {
        fontSize: 16,
        marginTop: 15,
    },
    tripCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 15,
        borderLeftWidth: 4,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    tripHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    tripTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    tripTitleBlock: {
        flex: 1,
        paddingRight: 12,
    },
    destinationText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 8,
        flexShrink: 1,
    },
    dateText: {
        fontSize: 12,
        marginTop: 5,
        marginLeft: 28,
    },
    tripDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailText: {
        fontSize: 14,
        marginLeft: 8,
    },
    hazardTagsContainer: {
        marginTop: 8,
    },
    hazardTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    tag: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
    },
    tagText: {
        fontSize: 12,
        fontWeight: '500',
    },
    bookingImageContainer: {
        width: '100%',
        height: 160,
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 8,
        marginBottom: 4,
    },
    bookingImage: {
        width: '100%',
        height: '100%',
    },
    tapToViewBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    tapToViewText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    previewOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewContainer: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewFullImage: {
        width: '95%',
        height: '80%',
    },
    previewCloseBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
    },
});
