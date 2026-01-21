import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import {
  getSleepRecords,
  getCurrentSleep,
  recordBedtime,
  cancelBedtime,
  formatDuration,
  formatTime,
  formatDate,
  getMonthlyStats,
} from '../storage/sleepStorage';

const SleepHistory = ({ onWakeRecord }) => {
  const [records, setRecords] = useState([]);
  const [currentSleep, setCurrentSleep] = useState(null);
  const [stats, setStats] = useState(null);

  const loadData = useCallback(async () => {
    const sleepRecords = await getSleepRecords();
    setRecords(sleepRecords);
    setStats(getMonthlyStats(sleepRecords));

    const current = await getCurrentSleep();
    setCurrentSleep(current);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBedtime = async () => {
    if (currentSleep) {
      // すでに就寝中の場合はキャンセル確認
      Alert.alert(
        '就寝記録をキャンセル',
        '現在の就寝記録をキャンセルしますか？',
        [
          { text: 'いいえ', style: 'cancel' },
          {
            text: 'はい',
            onPress: async () => {
              await cancelBedtime();
              setCurrentSleep(null);
            },
          },
        ]
      );
    } else {
      await recordBedtime();
      const current = await getCurrentSleep();
      setCurrentSleep(current);
    }
  };

  const renderRecord = ({ item }) => (
    <View style={styles.recordItem}>
      <Text style={styles.recordDate}>{formatDate(item.wakeTime || item.bedtime)}</Text>
      <View style={styles.recordTimes}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>就寝</Text>
          <Text style={styles.timeValue}>{formatTime(item.bedtime)}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>起床</Text>
          <Text style={styles.timeValue}>{formatTime(item.wakeTime)}</Text>
        </View>
        <View style={styles.durationBlock}>
          <Text style={styles.durationValue}>{formatDuration(item.duration)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* おやすみボタン */}
      <TouchableOpacity
        style={[
          styles.bedtimeButton,
          currentSleep && styles.bedtimeButtonActive,
        ]}
        onPress={handleBedtime}
      >
        <Text style={styles.bedtimeIcon}>{currentSleep ? '😴' : '🌙'}</Text>
        <Text style={styles.bedtimeText}>
          {currentSleep
            ? `おやすみ中... ${formatTime(currentSleep.bedtime)}〜`
            : 'おやすみ'}
        </Text>
      </TouchableOpacity>

      {/* 月間統計 */}
      {stats && stats.count > 0 && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>過去30日間</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>平均起床</Text>
              <Text style={styles.statValue}>{stats.avgWakeTime || '-'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>平均就寝</Text>
              <Text style={styles.statValue}>{stats.avgBedtime || '-'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>平均睡眠</Text>
              <Text style={styles.statValue}>{formatDuration(stats.avgDuration)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 履歴リスト */}
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>睡眠履歴</Text>
        <Text style={styles.historyCount}>{records.length}件</Text>
      </View>

      {records.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>記録がありません</Text>
          <Text style={styles.emptySubtext}>
            「おやすみ」を押して就寝を記録{'\n'}
            アラームを止めると起床を記録します
          </Text>
        </View>
      ) : (
        records.map((item) => (
          <View key={item.id}>
            {renderRecord({ item })}
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bedtimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1c1e',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    paddingVertical: 20,
    borderRadius: 16,
  },
  bedtimeButtonActive: {
    backgroundColor: '#1a2a4a',
    borderWidth: 2,
    borderColor: '#4a6a9a',
  },
  bedtimeIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  bedtimeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  statsContainer: {
    backgroundColor: '#1c1c1e',
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 16,
    borderRadius: 12,
  },
  statsTitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  historyCount: {
    fontSize: 14,
    color: '#666',
  },
  list: {
    flex: 1,
  },
  recordItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  recordDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  recordTimes: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '300',
    color: '#fff',
  },
  arrow: {
    fontSize: 16,
    color: '#666',
    marginHorizontal: 12,
  },
  durationBlock: {
    flex: 1,
    alignItems: 'flex-end',
  },
  durationValue: {
    fontSize: 16,
    color: '#5AC8FA',
    fontWeight: '600',
  },
  emptyContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default SleepHistory;
