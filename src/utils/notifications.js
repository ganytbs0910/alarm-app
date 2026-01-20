import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
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

// 利用可能なサウンドID（ランダム選択用）
const AVAILABLE_SOUNDS = ['default', 'alarm', 'bell', 'chime', 'digital', 'gentle'];

// サウンド名からファイル名を取得
const getSoundFile = (soundId) => {
  // ランダムが選択された場合、ランダムにサウンドを選択
  if (soundId === 'random') {
    const randomIndex = Math.floor(Math.random() * AVAILABLE_SOUNDS.length);
    const selectedSound = AVAILABLE_SOUNDS[randomIndex];
    console.log('Random sound selected:', selectedSound);
    return selectedSound;
  }
  // カスタムサウンドファイルがある場合はここで対応
  // 現在はすべてデフォルトサウンドを使用
  return 'default';
};

// 毎日アラーム
export const scheduleDailyAlarm = async (alarm) => {
  const { hour, minute, id, label, sound } = alarm;

  const trigger = {
    type: 'daily',
    hour: hour,
    minute: minute,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '毎日アラーム',
      body: label || '起きる時間です！',
      sound: getSoundFile(sound),
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { type: 'daily', id, hour, minute, label, sound },
      categoryIdentifier: 'alarm',
    },
    trigger,
    identifier: id,
  });
};

// 今すぐアラーム
export const scheduleQuickAlarm = async (alarm) => {
  const { seconds, id, label, sound } = alarm;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '今すぐアラーム',
      body: label || 'タイマー終了！',
      sound: getSoundFile(sound),
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { type: 'quick', id, seconds, label, sound },
      categoryIdentifier: 'alarm',
    },
    trigger: {
      type: 'timeInterval',
      seconds: seconds,
      repeats: false,
    },
    identifier: id,
  });
};

// 起きるまでアラーム
export const scheduleWakeUpAlarm = async (alarm) => {
  const { hour, minute, id, reason, sound } = alarm;

  const trigger = {
    type: 'calendar',
    hour: hour,
    minute: minute,
    repeats: false,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '起きるまでアラーム',
      body: reason || '起きる時間です！',
      sound: getSoundFile(sound),
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { type: 'wakeup', id, reason, speakText: true, hour, minute, sound },
      categoryIdentifier: 'alarm',
    },
    trigger,
    identifier: id,
  });
};

// スヌーズアラーム（5分後）
export const scheduleSnoozeAlarm = async (originalData) => {
  const snoozeId = `snooze_${Date.now()}`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'スヌーズ',
      body: originalData.label || originalData.reason || '起きる時間です！',
      sound: getSoundFile(originalData.sound),
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { ...originalData, isSnooze: true },
      categoryIdentifier: 'alarm',
    },
    trigger: {
      type: 'timeInterval',
      seconds: 300, // 5分
      repeats: false,
    },
    identifier: snoozeId,
  });

  return snoozeId;
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
