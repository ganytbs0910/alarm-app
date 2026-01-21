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
import { Ionicons } from '@expo/vector-icons';
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
import { getWeatherData, getWeatherStatus } from './src/utils/weather';
import BannerAdComponent from './src/components/BannerAd';
import Stopwatch from './src/components/Stopwatch';
import SleepHistory from './src/components/SleepHistory';
import { recordWakeTime } from './src/storage/sleepStorage';
import {
  connectToIAP,
  disconnectFromIAP,
  getProducts,
  purchaseProduct,
  restorePurchases,
  validateSubscription,
} from './src/services/iapService';
import {
  PRODUCT_IDS,
  getSubscription,
} from './src/storage/subscriptionStorage';

// メインタブ
const MAIN_TABS = {
  ALARM: 'alarm',
  STOPWATCH: 'stopwatch',
  SLEEP: 'sleep',
};

// 無料版のアラーム数制限
const FREE_ALARM_LIMIT = 7;

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
  { id: 'random', label: 'ランダム', recommended: true },
  { id: 'default', label: 'デフォルト' },
  { id: 'alarm', label: 'アラーム' },
  { id: 'bell', label: 'ベル' },
  { id: 'chime', label: 'チャイム' },
  { id: 'digital', label: 'デジタル' },
  { id: 'gentle', label: 'やさしい' },
];

export default function App() {
  const [mainTab, setMainTab] = useState(MAIN_TABS.ALARM);
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
  const [weather, setWeather] = useState(null); // { status: 'rain'|'cloudy'|'sunny', probability: number } or null
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [products, setProducts] = useState([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);

  // タイムアウト付きPromise
  const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    );
    return Promise.race([promise, timeout]);
  };

  // IAPとサブスクリプションの初期化
  const initializeSubscription = async () => {
    try {
      // IAP接続（5秒タイムアウト）
      await withTimeout(connectToIAP(), 5000).catch(e => {
        console.log('IAP connection skipped:', e.message);
      });

      // 商品情報を取得（3秒タイムアウト）
      const productList = await withTimeout(getProducts(), 3000).catch(e => {
        console.log('Get products skipped:', e.message);
        return [];
      });
      setProducts(productList);

      // サブスクリプション状態を確認
      const { isValid, subscription } = await validateSubscription();
      setIsPremium(isValid);
      setSubscriptionDetails(subscription);
    } catch (error) {
      console.error('Error initializing subscription:', error);
      // エラーが起きても続行
    }
  };

  useEffect(() => {
    // 各初期化処理を安全に実行
    loadAlarms().catch(e => console.log('Load alarms error:', e));
    requestPermissions().catch(e => console.log('Request permissions error:', e));
    setupNotificationCategories().catch(e => console.log('Setup categories error:', e));
    fetchWeather().catch(e => console.log('Fetch weather error:', e));
    initializeSubscription();

    // 通知受信時の処理
    const notificationSubscription = addNotificationListener((notification) => {
      const data = notification.request.content.data;
      if (data?.speakText && data?.reason) {
        speakText(data.reason);
      }
    });

    // 通知ボタン押下時の処理
    const responseSubscription = addNotificationResponseListener(async (response) => {
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data;

      if (actionId === 'stop') {
        // 停止ボタン - 起床記録を追加
        console.log('Alarm stopped');
        await recordWakeTime();
      } else if (actionId === 'snooze') {
        // スヌーズボタン - 5分後に再通知
        scheduleSnoozeAlarm(data);
        console.log('Snooze scheduled for 5 minutes');
      } else {
        // 通知をタップしてアプリを開いた場合も起床記録を追加
        console.log('Alarm notification tapped');
        await recordWakeTime();
      }
    });

    return () => {
      notificationSubscription.remove();
      responseSubscription.remove();
      disconnectFromIAP();
    };
  }, []);

  // 購入処理
  const handlePurchase = async (productId) => {
    setPurchaseLoading(true);
    try {
      const result = await purchaseProduct(productId);
      if (result.success) {
        setIsPremium(true);
        setSubscriptionDetails(result.subscription);
        Alert.alert(
          '購入完了',
          'プレミアム会員になりました！\nすべての機能をお楽しみください。'
        );
        setSubscriptionModalVisible(false);
      } else if (result.error === 'canceled') {
        // キャンセルは何もしない
      } else {
        Alert.alert('購入エラー', result.error || '購入処理に失敗しました');
      }
    } catch (error) {
      Alert.alert('エラー', '購入処理中にエラーが発生しました');
    } finally {
      setPurchaseLoading(false);
    }
  };

  // 購入復元処理
  const handleRestore = async () => {
    setPurchaseLoading(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        if (result.restored) {
          setIsPremium(true);
          setSubscriptionDetails(result.subscription);
          Alert.alert('復元完了', 'プレミアム会員の購入を復元しました！');
        } else {
          Alert.alert('復元', '復元可能な購入が見つかりませんでした');
        }
      } else {
        Alert.alert('復元エラー', result.error || '復元処理に失敗しました');
      }
    } catch (error) {
      Alert.alert('エラー', '復元処理中にエラーが発生しました');
    } finally {
      setPurchaseLoading(false);
    }
  };

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
    const data = await getWeatherData();
    if (data) {
      setWeather({
        status: getWeatherStatus(data),
        probability: data.probability,
      });
    } else {
      setWeather(null);
    }
  };

  const filteredAlarms = alarms.filter((a) => a.type === activeTab);

  const handleAddAlarm = () => {
    // 無料版のアラーム数制限チェック
    if (!isPremium && alarms.length >= FREE_ALARM_LIMIT) {
      Alert.alert(
        'アラーム数制限',
        `無料版では${FREE_ALARM_LIMIT}個までです。\nプレミアムにアップグレードすると無制限に作成できます。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: 'プレミアムを見る', onPress: () => setSubscriptionModalVisible(true) },
        ]
      );
      return;
    }

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
              sound.recommended && styles.soundOptionRecommended,
            ]}
            onPress={() => setSelectedSound(sound.id)}
          >
            {sound.recommended && (
              <Text style={styles.recommendedBadge}>おすすめ</Text>
            )}
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
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />

          {mainTab === MAIN_TABS.ALARM ? (
            <>
              <TouchableOpacity
                style={[styles.umbrellaContainer, weather?.status === 'rain' && styles.umbrellaRain, weather?.status === 'cloudy' && styles.umbrellaCloudy]}
                onPress={fetchWeather}
              >
                <Text style={styles.umbrellaIcon}>
                  {weather === null ? '...' : weather.status === 'rain' ? '☔️' : weather.status === 'cloudy' ? '☁️' : '☀️'}
                </Text>
                <Text style={styles.umbrellaText}>
                  {weather === null
                    ? '取得中'
                    : weather.status === 'rain'
                    ? `雨 ${weather.probability}%`
                    : weather.status === 'cloudy'
                    ? `曇り ${weather.probability}%`
                    : `晴れ ${100 - weather.probability}%`}
                </Text>
                <Text style={styles.umbrellaAdvice}>
                  {weather === null
                    ? ''
                    : weather.status === 'rain'
                    ? '傘を持っていこう'
                    : weather.status === 'cloudy'
                    ? '傘があると安心'
                    : '傘は不要'}
                </Text>
              </TouchableOpacity>

              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <TouchableOpacity
                    style={styles.subscriptionButton}
                    onPress={() => setSubscriptionModalVisible(true)}
                  >
                    {isPremium ? (
                      <Text style={styles.premiumBadgeButton}>PRO</Text>
                    ) : (
                      <Text style={styles.subscriptionButtonText}>Premium</Text>
                    )}
                  </TouchableOpacity>
                </View>
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
            {!isPremium && (
              <Text style={styles.alarmLimitText}>
                無料版: {alarms.length}/{FREE_ALARM_LIMIT}個
              </Text>
            )}
          </View>
        ) : (
          <>
            <FlatList
              data={filteredAlarms}
              renderItem={renderAlarm}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
            />
            {!isPremium && (
              <View style={styles.alarmLimitContainer}>
                <Text style={styles.alarmLimitText}>
                  無料版: {alarms.length}/{FREE_ALARM_LIMIT}個
                </Text>
              </View>
            )}
          </>
        )}
            </>
          ) : mainTab === MAIN_TABS.STOPWATCH ? (
            <Stopwatch />
          ) : (
            <SleepHistory />
          )}

          {/* 画面下部のタブバー */}
          <View style={styles.bottomTabBar}>
            <TouchableOpacity
              style={styles.bottomTab}
              onPress={() => setMainTab(MAIN_TABS.ALARM)}
            >
              <Ionicons
                name="alarm-outline"
                size={22}
                color={mainTab === MAIN_TABS.ALARM ? '#007AFF' : '#666'}
              />
              <Text
                style={[
                  styles.bottomTabText,
                  mainTab === MAIN_TABS.ALARM && styles.bottomTabTextActive,
                ]}
              >
                アラーム
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bottomTab}
              onPress={() => setMainTab(MAIN_TABS.STOPWATCH)}
            >
              <Ionicons
                name="stopwatch-outline"
                size={22}
                color={mainTab === MAIN_TABS.STOPWATCH ? '#007AFF' : '#666'}
              />
              <Text
                style={[
                  styles.bottomTabText,
                  mainTab === MAIN_TABS.STOPWATCH && styles.bottomTabTextActive,
                ]}
              >
                ストップウォッチ
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bottomTab}
              onPress={() => setMainTab(MAIN_TABS.SLEEP)}
            >
              <Ionicons
                name="moon-outline"
                size={22}
                color={mainTab === MAIN_TABS.SLEEP ? '#007AFF' : '#666'}
              />
              <Text
                style={[
                  styles.bottomTabText,
                  mainTab === MAIN_TABS.SLEEP && styles.bottomTabTextActive,
                ]}
              >
                睡眠
              </Text>
            </TouchableOpacity>
          </View>

          {/* バナー広告（一番下） */}
          <BannerAdComponent isPremium={isPremium} />

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

        <Modal
          animationType="slide"
          transparent={true}
          visible={subscriptionModalVisible}
          onRequestClose={() => !purchaseLoading && setSubscriptionModalVisible(false)}
        >
          <View style={styles.subscriptionOverlay}>
            <View style={styles.subscriptionContent}>
              <Text style={styles.subscriptionTitle}>
                {isPremium ? 'プレミアム会員' : 'プレミアムにアップグレード'}
              </Text>

              {!isPremium ? (
                <>
                  <Text style={styles.subscriptionDescription}>
                    すべての機能をアンロック
                  </Text>

                  <View style={styles.featureList}>
                    <View style={styles.featureRow}>
                      <Ionicons name="close-circle" size={20} color="#666" />
                      <Text style={styles.featureItem}>広告なし</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="infinite" size={20} color="#666" />
                      <Text style={styles.featureItem}>無制限のアラーム</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="musical-notes" size={20} color="#666" />
                      <Text style={styles.featureItem}>カスタムサウンド</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="stats-chart" size={20} color="#666" />
                      <Text style={styles.featureItem}>詳細な睡眠分析</Text>
                    </View>
                  </View>

                  <View style={styles.planContainer}>
                    <TouchableOpacity
                      style={[styles.planOption, purchaseLoading && styles.planDisabled]}
                      onPress={() => handlePurchase(PRODUCT_IDS.MONTHLY)}
                      disabled={purchaseLoading}
                    >
                      <Text style={styles.planTitle}>月額プラン</Text>
                      <Text style={styles.planPrice}>¥300/月</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.planOption, styles.planRecommended, purchaseLoading && styles.planDisabled]}
                      onPress={() => handlePurchase(PRODUCT_IDS.YEARLY)}
                      disabled={purchaseLoading}
                    >
                      <Text style={styles.planBadge}>おすすめ</Text>
                      <Text style={styles.planTitle}>年額プラン</Text>
                      <Text style={styles.planPrice}>¥2,400/年</Text>
                      <Text style={styles.planSaving}>2ヶ月分お得</Text>
                    </TouchableOpacity>
                  </View>

                  {purchaseLoading && (
                    <Text style={styles.loadingText}>処理中...</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.restoreButton, purchaseLoading && styles.buttonDisabled]}
                    onPress={handleRestore}
                    disabled={purchaseLoading}
                  >
                    <Text style={styles.restoreButtonText}>購入を復元</Text>
                  </TouchableOpacity>

                  <Text style={styles.termsText}>
                    購入すると利用規約に同意したことになります。{'\n'}
                    サブスクリプションは期間終了の24時間前までに{'\n'}
                    キャンセルしない限り自動更新されます。
                  </Text>
                </>
              ) : (
                <View style={styles.premiumInfo}>
                  <Ionicons name="checkmark-circle" size={48} color="#34C759" />
                  <Text style={styles.premiumStatus}>プレミアム会員</Text>
                  <Text style={styles.premiumDetail}>すべての機能が利用可能です</Text>

                  {subscriptionDetails?.expirationDate && (
                    <Text style={styles.expirationText}>
                      有効期限: {new Date(subscriptionDetails.expirationDate).toLocaleDateString('ja-JP')}
                    </Text>
                  )}

                  <View style={styles.premiumFeatures}>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark" size={18} color="#34C759" />
                      <Text style={styles.premiumFeatureItem}>広告なし</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark" size={18} color="#34C759" />
                      <Text style={styles.premiumFeatureItem}>無制限のアラーム</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark" size={18} color="#34C759" />
                      <Text style={styles.premiumFeatureItem}>カスタムサウンド</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark" size={18} color="#34C759" />
                      <Text style={styles.premiumFeatureItem}>詳細な睡眠分析</Text>
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.closeSubscriptionButton, purchaseLoading && styles.buttonDisabled]}
                onPress={() => setSubscriptionModalVisible(false)}
                disabled={purchaseLoading}
              >
                <Text style={styles.closeSubscriptionButtonText}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    umbrellaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#1c1c1e',
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 16,
  },
  umbrellaRain: {
    backgroundColor: '#1a3a5c',
  },
  umbrellaCloudy: {
    backgroundColor: '#2a2a30',
  },
  umbrellaIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  umbrellaText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  umbrellaAdvice: {
    fontSize: 14,
    color: '#aaa',
    marginLeft: 12,
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
  headerLeft: {
    width: 80,
  },
  subscriptionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#2c2c2e',
  },
  subscriptionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  premiumBadgeButton: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD700',
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
  alarmLimitContainer: {
    padding: 10,
    alignItems: 'center',
  },
  alarmLimitText: {
    fontSize: 12,
    color: '#666',
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
    alignItems: 'center',
  },
  soundOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  soundOptionRecommended: {
    borderColor: '#FFD700',
    borderWidth: 2,
  },
  recommendedBadge: {
    fontSize: 9,
    color: '#FFD700',
    fontWeight: 'bold',
    marginBottom: 2,
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
  // サブスクリプションモーダル
  subscriptionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscriptionContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  subscriptionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subscriptionDescription: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  featureList: {
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  featureItem: {
    fontSize: 16,
    color: '#fff',
  },
  planContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  planOption: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3c3c3e',
  },
  planRecommended: {
    borderColor: '#FFD700',
  },
  planDisabled: {
    opacity: 0.5,
  },
  planBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFD700',
    backgroundColor: '#3a3a00',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  planTitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  planSaving: {
    fontSize: 12,
    color: '#4CD964',
    marginTop: 4,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  restoreButtonText: {
    fontSize: 14,
    color: '#007AFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 12,
  },
  termsText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 12,
  },
  premiumInfo: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  premiumStatus: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    marginBottom: 4,
  },
  premiumDetail: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  expirationText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  premiumFeatures: {
    marginTop: 16,
    width: '100%',
  },
  premiumFeatureItem: {
    fontSize: 15,
    color: '#fff',
  },
  closeSubscriptionButton: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  closeSubscriptionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  // 画面下部のタブバー
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 6,
    paddingBottom: 30,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  bottomTabText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  bottomTabTextActive: {
    color: '#007AFF',
  },
});
