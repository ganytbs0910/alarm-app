import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { StatusBar } from 'expo-status-bar';
import {
  getAlarms,
  addAlarm,
  updateAlarm,
  deleteAlarm,
  ALARM_TYPES,
} from './src/storage/alarmStorage';
import {
  requestPermissions,
  scheduleDailyAlarm,
  scheduleQuickAlarm,
  scheduleWakeUpAlarm,
  cancelAlarm,
  speakText,
  addNotificationListener,
} from './src/utils/notifications';

const TABS = [
  { key: ALARM_TYPES.DAILY, label: '毎日' },
  { key: ALARM_TYPES.QUICK, label: '今すぐ' },
  { key: ALARM_TYPES.WAKEUP, label: '起きるまで' },
];

const QUICK_TIME_OPTIONS = [
  { label: '30秒', seconds: 30 },
  { label: '1分', seconds: 60 },
  { label: '5分', seconds: 300 },
  { label: '30分', seconds: 1800 },
  { label: '1時間', seconds: 3600 },
  { label: '3時間', seconds: 10800 },
];

export default function App() {
  const [alarms, setAlarms] = useState([]);
  const [activeTab, setActiveTab] = useState(ALARM_TYPES.DAILY);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [alarmLabel, setAlarmLabel] = useState('');
  const [wakeupReason, setWakeupReason] = useState('');
  const [quickSeconds, setQuickSeconds] = useState(0);
  const [editingAlarm, setEditingAlarm] = useState(null);
  const [volume, setVolume] = useState(1.0);

  useEffect(() => {
    loadAlarms();
    requestPermissions();

    const subscription = addNotificationListener((notification) => {
      const data = notification.request.content.data;
      if (data?.speakText && data?.reason) {
        speakText(data.reason);
      }
    });

    return () => subscription.remove();
  }, []);

  const loadAlarms = async () => {
    const savedAlarms = await getAlarms();
    setAlarms(savedAlarms);
  };

  const filteredAlarms = alarms.filter((a) => a.type === activeTab);

  const handleAddAlarm = () => {
    setEditingAlarm(null);
    setSelectedTime(new Date());
    setAlarmLabel('');
    setWakeupReason('');
    setQuickSeconds(0);
    setVolume(1.0);
    setModalVisible(true);
  };

  const handleEditAlarm = (alarm) => {
    setEditingAlarm(alarm);
    if (alarm.type === ALARM_TYPES.DAILY || alarm.type === ALARM_TYPES.WAKEUP) {
      const time = new Date();
      time.setHours(alarm.hour, alarm.minute, 0, 0);
      setSelectedTime(time);
    }
    setAlarmLabel(alarm.label || '');
    setWakeupReason(alarm.reason || '');
    setQuickSeconds(alarm.seconds || 0);
    setVolume(alarm.volume ?? 1.0);
    setModalVisible(true);
  };

  const handleSaveAlarm = async () => {
    if (activeTab === ALARM_TYPES.QUICK && quickSeconds === 0) {
      Alert.alert('エラー', '時間を選択してください');
      return;
    }

    if (activeTab === ALARM_TYPES.WAKEUP && !wakeupReason.trim()) {
      Alert.alert('エラー', '起きる理由を入力してください');
      return;
    }

    const hour = selectedTime.getHours();
    const minute = selectedTime.getMinutes();

    let alarmData;

    switch (activeTab) {
      case ALARM_TYPES.DAILY:
        alarmData = {
          type: ALARM_TYPES.DAILY,
          hour,
          minute,
          label: alarmLabel,
          volume,
        };
        break;
      case ALARM_TYPES.QUICK:
        alarmData = {
          type: ALARM_TYPES.QUICK,
          seconds: quickSeconds,
          label: alarmLabel || formatQuickTime(quickSeconds),
          triggerTime: new Date(Date.now() + quickSeconds * 1000).toISOString(),
          volume,
        };
        break;
      case ALARM_TYPES.WAKEUP:
        alarmData = {
          type: ALARM_TYPES.WAKEUP,
          hour,
          minute,
          reason: wakeupReason,
          label: wakeupReason,
          volume,
        };
        break;
    }

    if (editingAlarm) {
      await cancelAlarm(editingAlarm.id);
      const updatedAlarms = await updateAlarm(editingAlarm.id, alarmData);
      setAlarms(updatedAlarms);
      const updatedAlarm = updatedAlarms.find((a) => a.id === editingAlarm.id);
      if (updatedAlarm?.enabled) {
        await scheduleAlarmByType(updatedAlarm);
      }
    } else {
      const newAlarm = await addAlarm(alarmData);
      setAlarms((prev) => [...prev, newAlarm]);
      await scheduleAlarmByType(newAlarm);
    }

    setModalVisible(false);
  };

  const scheduleAlarmByType = async (alarm) => {
    switch (alarm.type) {
      case ALARM_TYPES.DAILY:
        await scheduleDailyAlarm(alarm);
        break;
      case ALARM_TYPES.QUICK:
        await scheduleQuickAlarm(alarm);
        break;
      case ALARM_TYPES.WAKEUP:
        await scheduleWakeUpAlarm(alarm);
        break;
    }
  };

  const handleToggleAlarm = async (alarm) => {
    const newEnabled = !alarm.enabled;
    const updatedAlarms = await updateAlarm(alarm.id, { enabled: newEnabled });
    setAlarms(updatedAlarms);

    if (newEnabled) {
      const updatedAlarm = updatedAlarms.find((a) => a.id === alarm.id);
      await scheduleAlarmByType(updatedAlarm);
    } else {
      await cancelAlarm(alarm.id);
    }
  };

  const handleDeleteAlarm = (alarm) => {
    Alert.alert('削除確認', 'このアラームを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await cancelAlarm(alarm.id);
          const updatedAlarms = await deleteAlarm(alarm.id);
          setAlarms(updatedAlarms);
        },
      },
    ]);
  };

  const formatTime = (hour, minute) => {
    const displayHour = hour.toString().padStart(2, '0');
    const displayMinute = minute.toString().padStart(2, '0');
    return `${displayHour}:${displayMinute}`;
  };

  const formatQuickTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}時間`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);

    return parts.join('');
  };

  const handleQuickTimePress = (seconds) => {
    setQuickSeconds((prev) => prev + seconds);
  };

  const resetQuickTime = () => {
    setQuickSeconds(0);
  };

  const renderAlarm = ({ item }) => (
    <TouchableOpacity
      style={styles.alarmItem}
      onPress={() => handleEditAlarm(item)}
      onLongPress={() => handleDeleteAlarm(item)}
    >
      <View style={styles.alarmInfo}>
        {item.type === ALARM_TYPES.QUICK ? (
          <Text style={[styles.alarmTime, !item.enabled && styles.disabledText]}>
            {formatQuickTime(item.seconds)}
          </Text>
        ) : (
          <Text style={[styles.alarmTime, !item.enabled && styles.disabledText]}>
            {formatTime(item.hour, item.minute)}
          </Text>
        )}
        {item.label ? (
          <Text style={[styles.alarmLabel, !item.enabled && styles.disabledText]}>
            {item.label}
          </Text>
        ) : null}
        {item.type === ALARM_TYPES.WAKEUP && (
          <Text style={[styles.alarmTypeTag, styles.wakeupTag]}>音声読み上げ</Text>
        )}
      </View>
      <Switch
        value={item.enabled}
        onValueChange={() => handleToggleAlarm(item)}
        trackColor={{ false: '#767577', true: '#81b0ff' }}
        thumbColor={item.enabled ? '#007AFF' : '#f4f3f4'}
      />
    </TouchableOpacity>
  );

  const renderVolumeSlider = () => (
    <View style={styles.volumeContainer}>
      <Text style={styles.volumeLabel}>音量: {Math.round(volume * 100)}%</Text>
      <Slider
        style={styles.volumeSlider}
        minimumValue={0}
        maximumValue={1}
        value={volume}
        onValueChange={setVolume}
        minimumTrackTintColor="#007AFF"
        maximumTrackTintColor="#555"
        thumbTintColor="#007AFF"
      />
    </View>
  );

  const renderModalContent = () => {
    switch (activeTab) {
      case ALARM_TYPES.DAILY:
        return (
          <>
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display="spinner"
              onChange={(event, date) => date && setSelectedTime(date)}
              style={styles.timePicker}
              textColor="#fff"
            />
            <TextInput
              style={styles.labelInput}
              placeholder="ラベル（任意）"
              value={alarmLabel}
              onChangeText={setAlarmLabel}
              placeholderTextColor="#999"
            />
            {renderVolumeSlider()}
          </>
        );

      case ALARM_TYPES.QUICK:
        return (
          <>
            <View style={styles.quickTimeDisplay}>
              <Text style={styles.quickTimeText}>
                {quickSeconds > 0 ? formatQuickTime(quickSeconds) : '0秒'}
              </Text>
              <TouchableOpacity onPress={resetQuickTime} style={styles.resetButton}>
                <Text style={styles.resetButtonText}>リセット</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.quickButtonsContainer}>
              {QUICK_TIME_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.seconds}
                  style={styles.quickButton}
                  onPress={() => handleQuickTimePress(option.seconds)}
                >
                  <Text style={styles.quickButtonText}>+{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.labelInput}
              placeholder="ラベル（任意）"
              value={alarmLabel}
              onChangeText={setAlarmLabel}
              placeholderTextColor="#999"
            />
            {renderVolumeSlider()}
          </>
        );

      case ALARM_TYPES.WAKEUP:
        return (
          <>
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display="spinner"
              onChange={(event, date) => date && setSelectedTime(date)}
              style={styles.timePicker}
              textColor="#fff"
            />
            <TextInput
              style={[styles.labelInput, styles.reasonInput]}
              placeholder="起きる理由を入力（読み上げられます）"
              value={wakeupReason}
              onChangeText={setWakeupReason}
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />
            {renderVolumeSlider()}
          </>
        );
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>アラーム</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddAlarm}>
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabContainer}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredAlarms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>アラームがありません</Text>
            <Text style={styles.emptySubtext}>+ボタンで追加してください</Text>
            {activeTab === ALARM_TYPES.WAKEUP && (
              <TouchableOpacity
                style={styles.testSpeechButton}
                onPress={() => speakText('おはようございます。起きる時間です。')}
              >
                <Text style={styles.testSpeechButtonText}>音声テスト</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredAlarms}
            renderItem={renderAlarm}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}

        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingAlarm ? 'アラームを編集' : '新しいアラーム'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {TABS.find((t) => t.key === activeTab)?.label}
              </Text>

              <ScrollView style={styles.modalScrollView}>
                {renderModalContent()}
              </ScrollView>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSaveAlarm}
                >
                  <Text style={styles.saveButtonText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  alarmItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  alarmInfo: {
    flex: 1,
  },
  alarmTime: {
    fontSize: 48,
    fontWeight: '200',
    color: '#fff',
  },
  alarmLabel: {
    fontSize: 16,
    color: '#999',
    marginTop: 4,
  },
  alarmTypeTag: {
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  wakeupTag: {
    backgroundColor: '#FF9500',
    color: '#fff',
  },
  disabledText: {
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 20,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#444',
    marginTop: 8,
  },
  testSpeechButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FF9500',
    borderRadius: 10,
  },
  testSpeechButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  timePicker: {
    height: 200,
    marginBottom: 20,
  },
  volumeContainer: {
    marginBottom: 20,
  },
  volumeLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  volumeSlider: {
    width: '100%',
    height: 40,
  },
  labelInput: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    color: '#fff',
    marginBottom: 20,
  },
  reasonInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  quickTimeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  quickTimeText: {
    fontSize: 48,
    fontWeight: '200',
    color: '#fff',
  },
  resetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  quickButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  quickButton: {
    width: '30%',
    paddingVertical: 15,
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    alignItems: 'center',
  },
  quickButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2c2c2e',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
