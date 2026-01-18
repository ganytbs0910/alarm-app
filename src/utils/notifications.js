import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Tts from 'react-native-tts';

// TTS初期化
const initTts = async () => {
  try {
    await Tts.setDefaultLanguage('ja-JP');
  } catch (e) {
    console.log('TTS init error:', e);
  }
};
initTts();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

// 毎日アラーム
export const scheduleDailyAlarm = async (alarm) => {
  const { hour, minute, id, label } = alarm;

  const trigger = {
    hour: hour,
    minute: minute,
    repeats: true,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '毎日アラーム',
      body: label || '起きる時間です！',
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { type: 'daily', id },
    },
    trigger,
    identifier: id,
  });
};

// 今すぐアラーム
export const scheduleQuickAlarm = async (alarm) => {
  const { seconds, id, label } = alarm;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '今すぐアラーム',
      body: label || 'タイマー終了！',
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { type: 'quick', id },
    },
    trigger: {
      seconds: seconds,
      repeats: false,
    },
    identifier: id,
  });
};

// 起きるまでアラーム
export const scheduleWakeUpAlarm = async (alarm) => {
  const { hour, minute, id, reason } = alarm;

  const trigger = {
    hour: hour,
    minute: minute,
    repeats: false,
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '起きるまでアラーム',
      body: reason || '起きる時間です！',
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250, 250, 250],
      data: { type: 'wakeup', id, reason, speakText: true },
    },
    trigger,
    identifier: id,
  });
};

// 音声読み上げ（react-native-tts使用）
export const speakText = async (text) => {
  try {
    // バイブレーション
    await vibrateAlarm();

    // 音声読み上げ
    await Tts.speak(text);
  } catch (error) {
    console.log('TTS Error:', error);
  }
};

// 音声読み上げを停止
export const stopSpeaking = async () => {
  try {
    await Tts.stop();
  } catch (error) {
    console.log('TTS Stop Error:', error);
  }
};

// アラームをキャンセル
export const cancelAlarm = async (id) => {
  await Notifications.cancelScheduledNotificationAsync(id);
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
