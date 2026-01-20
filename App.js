import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
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
  addNotificationResponseListener,
  setupNotificationCategories,
  scheduleSnoozeAlarm,
  dismissAllNotifications,
} from './src/utils/notifications';
import { getWeatherData, getUmbrellaMessage } from './src/utils/weather';

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

const SOUND_OPTIONS = [
  { id: 'default', label: 'デフォルト' },
  { id: 'random', label: 'ランダム' },
  { id: 'alarm', label: 'アラーム' },
  { id: 'bell', label: 'ベル' },
  { id: 'chime', label: 'チャイム' },
  { id: 'digital', label: 'デジタル' },
  { id: 'gentle', label: 'やさしい' },
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
  const [selectedSound, setSelectedSound] = useState('default');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [umbrellaInfo, setUmbrellaInfo] = useState({ message: '天気を取得中...', icon: '...' });

  useEffect(() => {
    loadAlarms();
    requestPermissions();
    setupNotificationCategories();
    fetchWeather();

    // 通知受信時の処理
    const notificationSubscription = addNotificationListener((notification) => {
      const data = notification.request.content.data;
      if (data?.speakText && data?.reason) {
        speakText(data.reason);
      }
    });

    // 通知ボタン押下時の処理
    const responseSubscription = addNotificationResponseListener((response) => {
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data;

      if (actionId === 'stop') {
        // 停止ボタン - 何もしない（通知は自動で消える）
        console.log('Alarm stopped');
      } else if (actionId === 'snooze') {
        // スヌーズボタン - 5分後に再通知
        scheduleSnoozeAlarm(data);
        console.log('Snooze scheduled for 5 minutes');
      }
    });

    return () => {
      notificationSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // 今すぐアラームがあれば1秒ごと、なければ1分ごとに更新
  useEffect(() => {
    const hasQuickAlarm = alarms.some(
      (a) => a.type === ALARM_TYPES.QUICK && a.enabled
    );
    const interval = hasQuickAlarm ? 1000 : 60000;

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, interval);
    return () => clearInterval(timer);
  }, [alarms]);

  // アプリがフォアグラウンドに来たら通知を消す
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        dismissAllNotifications();
      }
    });

    return () => subscription.remove();
  }, []);

  const getRemainingTime = (alarm, includePrefix = true) => {
    if (!alarm.enabled) return null;

    const now = currentTime;
    let targetTime = new Date();

    if (alarm.type === ALARM_TYPES.QUICK) {
      if (!alarm.triggerTime) return null;
      targetTime = new Date(alarm.triggerTime);
    } else {
      targetTime.setHours(alarm.hour, alarm.minute, 0, 0);
      if (targetTime <= now) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
    }

    const diffMs = targetTime - now;
    if (diffMs <= 0) return null;

    const prefix = includePrefix ? 'あと' : '';

    // 今すぐアラームは秒単位で表示
    if (alarm.type === ALARM_TYPES.QUICK) {
      const totalSecs = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      if (hours > 0) {
        return `${prefix}${hours}時間${mins}分${secs}秒`;
      } else if (mins > 0) {
        return `${prefix}${mins}分${secs}秒`;
      } else {
        return `${prefix}${secs}秒`;
      }
    }

    // 毎日・起きるまでアラームは分単位
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (hours > 0) {
      return `${prefix}${hours}時間${mins}分`;
    } else {
      return `${prefix}${mins}分`;
    }
  };

  const loadAlarms = async () => {
    const savedAlarms = await getAlarms();
    setAlarms(savedAlarms);
  };

  const fetchWeather = async () => {
    const weatherData = await getWeatherData();
    const info = getUmbrellaMessage(weatherData);
    setUmbrellaInfo(info);
  };

  const filteredAlarms = alarms.filter((a) => a.type === activeTab);

  const handleAddAlarm = () => {
    setEditingAlarm(null);
    setSelectedTime(new Date());
    setAlarmLabel('');
    setWakeupReason('');
    setQuickSeconds(0);
    setVolume(1.0);
    setSelectedSound('default');
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
    setSelectedSound(alarm.sound || 'default');
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

    // モーダルを先に閉じる
    setModalVisible(false);

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
          sound: selectedSound,
        };
        break;
      case ALARM_TYPES.QUICK:
        alarmData = {
          type: ALARM_TYPES.QUICK,
          seconds: quickSeconds,
          label: alarmLabel || formatQuickTime(quickSeconds),
          triggerTime: new Date(Date.now() + quickSeconds * 1000).toISOString(),
          volume,
          sound: selectedSound,
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
          sound: selectedSound,
        };
        break;
    }

    try {
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
    } catch (error) {
      console.error('Alarm save error:', error);
      Alert.alert('エラー', 'アラームの保存に失敗しました: ' + error.message);
    }
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

    // 今すぐアラームをオンにする場合はtriggerTimeを更新
    let updates = { enabled: newEnabled };
    if (newEnabled && alarm.type === ALARM_TYPES.QUICK) {
      updates.triggerTime = new Date(Date.now() + alarm.seconds * 1000).toISOString();
    }

    const updatedAlarms = await updateAlarm(alarm.id, updates);
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

  const handleDeleteAlarmDirect = async (alarm) => {
    await cancelAlarm(alarm.id);
    const updatedAlarms = await deleteAlarm(alarm.id);
    setAlarms(updatedAlarms);
  };

  const renderRightActions = (progress, dragX, item) => {
    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteAlarmDirect(item)}
      >
        <Text style={styles.deleteButtonText}>削除</Text>
      </TouchableOpacity>
    );
  };

  const renderAlarm = ({ item }) => {
    const remainingTime = getRemainingTime(item);
    const remainingTimeNoPrefix = getRemainingTime(item, false);

    return (
      <Swipeable
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.alarmItem}
          onPress={() => handleEditAlarm(item)}
        >
          <View style={styles.alarmInfo}>
            {item.type === ALARM_TYPES.QUICK ? (
              <>
                {item.enabled && remainingTimeNoPrefix ? (
                  <Text style={styles.quickRemainingTime}>
                    {remainingTimeNoPrefix}
                  </Text>
                ) : (
                  <Text style={[styles.alarmTime, !item.enabled && styles.disabledText]}>
                    {formatQuickTime(item.seconds)}
                  </Text>
                )}
                {item.enabled && remainingTimeNoPrefix && (
                  <Text style={styles.alarmLabel}>
                    設定: {formatQuickTime(item.seconds)}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.alarmTime, !item.enabled && styles.disabledText]}>
                  {formatTime(item.hour, item.minute)}
                </Text>
                {remainingTime && (
                  <Text style={styles.remainingTime}>{remainingTime}</Text>
                )}
              </>
            )}
            {item.label && item.type !== ALARM_TYPES.QUICK ? (
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
      </Swipeable>
    );
  };

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

  const renderSoundPicker = () => (
    <View style={styles.soundContainer}>
      <Text style={styles.soundLabel}>サウンド</Text>
      <View style={styles.soundOptions}>
        {SOUND_OPTIONS.map((sound) => (
          <TouchableOpacity
            key={sound.id}
            style={[
              styles.soundOption,
              selectedSound === sound.id && styles.soundOptionSelected,
            ]}
            onPress={() => setSelectedSound(sound.id)}
          >
            <Text
              style={[
                styles.soundOptionText,
                selectedSound === sound.id && styles.soundOptionTextSelected,
              ]}
            >
              {sound.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
            {renderSoundPicker()}
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
            {renderSoundPicker()}
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
            {renderSoundPicker()}
            {renderVolumeSlider()}
          </>
        );
    }
  };

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
        <TouchableOpacity style={styles.weatherContainer} onPress={fetchWeather}>
          <Text style={styles.weatherIcon}>{umbrellaInfo.icon}</Text>
          <Text style={[
            styles.weatherText,
            umbrellaInfo.needsUmbrella && styles.weatherWarning
          ]}>
            {umbrellaInfo.message}
          </Text>
        </TouchableOpacity>

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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingAlarm ? 'アラームを編集' : '新しいアラーム'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {TABS.find((t) => t.key === activeTab)?.label}
              </Text>

              <ScrollView
                style={styles.modalScrollView}
                keyboardShouldPersistTaps="handled"
              >
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
          </KeyboardAvoidingView>
        </Modal>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  weatherContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#1c1c1e',
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
  },
  weatherIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  weatherText: {
    fontSize: 16,
    color: '#fff',
  },
  weatherWarning: {
    color: '#FF9500',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteButtonContent: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    paddingHorizontal: 0,
  },
  alarmItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#000',
  },
  alarmInfo: {
    flex: 1,
  },
  alarmTime: {
    fontSize: 36,
    fontWeight: '200',
    color: '#fff',
  },
  alarmLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  remainingTime: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
  },
  quickRemainingTime: {
    fontSize: 22,
    fontWeight: '300',
    color: '#5AC8FA',
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
  soundContainer: {
    marginBottom: 20,
  },
  soundLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  soundOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soundOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3c3c3e',
  },
  soundOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  soundOptionText: {
    color: '#fff',
    fontSize: 14,
  },
  soundOptionTextSelected: {
    fontWeight: '600',
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
