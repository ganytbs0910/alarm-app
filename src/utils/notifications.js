import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

// 通知カテゴリ（アクションボタン）を設定
export const setupNotificationCategories = async () => {
  await Notifications.setNotificationCategoryAsync('alarm', [
    {
      identifier: 'stop',
      buttonTitle: '停止',
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'snooze',
      buttonTitle: 'スヌーズ (5分)',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
};

export const requestPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('Existing notification permission status:', existingStatus);
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
      console.log('Requested notification permission, new status:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted!');
      return false;
    }

    // iOSの場合、通知チャネルの設定を確認
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alarm', {
        name: 'アラーム通知',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });
      console.log('Android notification channel created');
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

// バイブレーションパターン（アラーム用）
export const vibrateAlarm = async () => {
  for (let i = 0; i < 5; i++) {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

// 軽いバイブレーション
export const vibrateLight = async () => {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

// 利用可能なカスタムサウンド
const CUSTOM_SOUNDS = ['alarm', 'bell', 'chime', 'digital', 'gentle'];

// サウンド設定を取得
const getSoundSetting = (soundId) => {
  // デフォルトの場合はシステムサウンドを使用
  if (!soundId || soundId === 'default') {
    return true;
  }

  // ランダムの場合はカスタムサウンドからランダムに選択
  if (soundId === 'random') {
    const randomIndex = Math.floor(Math.random() * CUSTOM_SOUNDS.length);
    const selectedSound = CUSTOM_SOUNDS[randomIndex];
    console.log('Random sound selected:', selectedSound);
    return `${selectedSound}.wav`;
  }

  // カスタムサウンドの場合はファイル名を返す
  if (CUSTOM_SOUNDS.includes(soundId)) {
    return `${soundId}.wav`;
  }

  // 不明なサウンドIDの場合はデフォルトを使用
  return true;
};

// 毎日アラーム
export const scheduleDailyAlarm = async (alarm) => {
  const { hour, minute, id, label, sound } = alarm;

  try {
    const trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hour,
      minute: minute,
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ 毎日アラーム',
        body: label || '起きる時間です！',
        sound: getSoundSetting(sound),
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250, 250, 250],
        data: { type: 'daily', id, hour, minute, label, sound },
        categoryIdentifier: 'alarm',
        ...(Platform.OS === 'android' && { channelId: 'alarm' }),
      },
      trigger,
      identifier: id,
    });
    console.log('Daily alarm scheduled:', notificationId, 'at', hour, ':', minute);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling daily alarm:', error);
    throw error;
  }
};

// 今すぐアラーム
export const scheduleQuickAlarm = async (alarm) => {
  const { seconds, id, label, sound } = alarm;

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ 今すぐアラーム',
        body: label || 'タイマー終了！',
        sound: getSoundSetting(sound),
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250, 250, 250],
        data: { type: 'quick', id, seconds, label, sound },
        categoryIdentifier: 'alarm',
        ...(Platform.OS === 'android' && { channelId: 'alarm' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: seconds,
        repeats: false,
      },
      identifier: id,
    });
    console.log('Quick alarm scheduled:', notificationId, 'in', seconds, 'seconds');
    return notificationId;
  } catch (error) {
    console.error('Error scheduling quick alarm:', error);
    throw error;
  }
};

// 起きるまでアラーム
export const scheduleWakeUpAlarm = async (alarm) => {
  const { hour, minute, id, reason, sound } = alarm;

  try {
    // 次の発火時刻を計算
    const now = new Date();
    const targetDate = new Date();
    targetDate.setHours(hour, minute, 0, 0);

    // 既に過ぎている場合は翌日に設定
    if (targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ 起きるまでアラーム',
        body: reason || '起きる時間です！',
        sound: getSoundSetting(sound),
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250, 250, 250],
        data: { type: 'wakeup', id, reason, speakText: true, hour, minute, sound },
        categoryIdentifier: 'alarm',
        ...(Platform.OS === 'android' && { channelId: 'alarm' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetDate,
      },
      identifier: id,
    });
    console.log('WakeUp alarm scheduled:', notificationId, 'at', targetDate);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling wakeup alarm:', error);
    throw error;
  }
};

// スヌーズアラーム（5分後）
export const scheduleSnoozeAlarm = async (originalData) => {
  const snoozeId = `snooze_${Date.now()}`;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ スヌーズ',
        body: originalData.label || originalData.reason || '起きる時間です！',
        sound: getSoundSetting(originalData.sound),
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250, 250, 250],
        data: { ...originalData, isSnooze: true },
        categoryIdentifier: 'alarm',
        ...(Platform.OS === 'android' && { channelId: 'alarm' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 300, // 5分
        repeats: false,
      },
      identifier: snoozeId,
    });
    console.log('Snooze alarm scheduled:', snoozeId);
    return snoozeId;
  } catch (error) {
    console.error('Error scheduling snooze alarm:', error);
    throw error;
  }
};

// 音声読み上げ（expo-speech使用）
export const speakText = async (text) => {
  try {
    // バイブレーション
    await vibrateAlarm();

    // 音声読み上げ
    Speech.speak(text, {
      language: 'ja-JP',
      pitch: 1.0,
      rate: 0.9,
    });
  } catch (error) {
    console.log('Speech Error:', error);
  }
};

// 音声読み上げを停止
export const stopSpeaking = async () => {
  try {
    Speech.stop();
  } catch (error) {
    console.log('Speech Stop Error:', error);
  }
};

// アラームをキャンセル
export const cancelAlarm = async (id) => {
  await Notifications.cancelScheduledNotificationAsync(id);
};

// 表示中の通知を全て消す
export const dismissAllNotifications = async () => {
  await Notifications.dismissAllNotificationsAsync();
};

// 全てのアラームをキャンセル
export const cancelAllAlarms = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};

// 通知リスナーを設定
export const addNotificationListener = (callback) => {
  return Notifications.addNotificationReceivedListener(async (notification) => {
    await vibrateAlarm();
    callback(notification);
  });
};

export const addNotificationResponseListener = (callback) => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};
