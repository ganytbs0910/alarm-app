import AsyncStorage from '@react-native-async-storage/async-storage';

const SLEEP_RECORDS_KEY = 'sleep_records_v1';
const CURRENT_SLEEP_KEY = 'current_sleep_v1';

// 睡眠記録を取得
export const getSleepRecords = async () => {
  try {
    const json = await AsyncStorage.getItem(SLEEP_RECORDS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('Failed to load sleep records:', e);
    return [];
  }
};

// 睡眠記録を保存
export const saveSleepRecords = async (records) => {
  try {
    await AsyncStorage.setItem(SLEEP_RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save sleep records:', e);
  }
};

// 就寝時刻を記録（おやすみボタン）
export const recordBedtime = async () => {
  try {
    const bedtime = new Date().toISOString();
    await AsyncStorage.setItem(CURRENT_SLEEP_KEY, JSON.stringify({ bedtime }));
    return bedtime;
  } catch (e) {
    console.error('Failed to record bedtime:', e);
    return null;
  }
};

// 現在の就寝記録を取得
export const getCurrentSleep = async () => {
  try {
    const json = await AsyncStorage.getItem(CURRENT_SLEEP_KEY);
    return json ? JSON.parse(json) : null;
  } catch (e) {
    console.error('Failed to get current sleep:', e);
    return null;
  }
};

// 起床時刻を記録してレコードを完成
export const recordWakeTime = async () => {
  try {
    const currentSleep = await getCurrentSleep();
    if (!currentSleep || !currentSleep.bedtime) {
      // 就寝記録がない場合は起床のみ記録
      const wakeTime = new Date().toISOString();
      const record = {
        id: Date.now().toString(),
        bedtime: null,
        wakeTime,
        duration: null,
        date: new Date().toISOString().split('T')[0],
      };

      const records = await getSleepRecords();
      records.unshift(record);
      // 最大90日分保持
      const trimmed = records.slice(0, 90);
      await saveSleepRecords(trimmed);
      await AsyncStorage.removeItem(CURRENT_SLEEP_KEY);
      return record;
    }

    const wakeTime = new Date().toISOString();
    const bedtimeDate = new Date(currentSleep.bedtime);
    const wakeTimeDate = new Date(wakeTime);
    const durationMs = wakeTimeDate - bedtimeDate;
    const durationMinutes = Math.floor(durationMs / 60000);

    const record = {
      id: Date.now().toString(),
      bedtime: currentSleep.bedtime,
      wakeTime,
      duration: durationMinutes,
      date: new Date().toISOString().split('T')[0],
    };

    const records = await getSleepRecords();
    records.unshift(record);
    // 最大90日分保持
    const trimmed = records.slice(0, 90);
    await saveSleepRecords(trimmed);

    // 現在の睡眠記録をクリア
    await AsyncStorage.removeItem(CURRENT_SLEEP_KEY);

    return record;
  } catch (e) {
    console.error('Failed to record wake time:', e);
    return null;
  }
};

// 就寝記録をキャンセル
export const cancelBedtime = async () => {
  try {
    await AsyncStorage.removeItem(CURRENT_SLEEP_KEY);
  } catch (e) {
    console.error('Failed to cancel bedtime:', e);
  }
};

// 睡眠時間をフォーマット（分→時間分）
export const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}時間${mins}分`;
  }
  return `${mins}分`;
};

// 時刻をフォーマット
export const formatTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

// 日付をフォーマット
export const formatDate = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[date.getDay()];
  return `${month}/${day} (${weekday})`;
};

// 月間の睡眠統計を計算
export const getMonthlyStats = (records) => {
  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const monthlyRecords = records.filter(r => {
    const recordDate = new Date(r.date);
    return recordDate >= oneMonthAgo;
  });

  if (monthlyRecords.length === 0) {
    return {
      count: 0,
      avgWakeTime: null,
      avgDuration: null,
      avgBedtime: null,
    };
  }

  // 平均起床時刻を計算
  const wakeTimes = monthlyRecords
    .filter(r => r.wakeTime)
    .map(r => {
      const date = new Date(r.wakeTime);
      return date.getHours() * 60 + date.getMinutes();
    });

  const avgWakeMinutes = wakeTimes.length > 0
    ? Math.round(wakeTimes.reduce((a, b) => a + b, 0) / wakeTimes.length)
    : null;

  // 平均就寝時刻を計算
  const bedtimes = monthlyRecords
    .filter(r => r.bedtime)
    .map(r => {
      const date = new Date(r.bedtime);
      let minutes = date.getHours() * 60 + date.getMinutes();
      // 深夜0時以降は前日として扱う
      if (minutes < 12 * 60) minutes += 24 * 60;
      return minutes;
    });

  let avgBedtimeMinutes = bedtimes.length > 0
    ? Math.round(bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length)
    : null;

  // 24時間を超えている場合は調整
  if (avgBedtimeMinutes && avgBedtimeMinutes >= 24 * 60) {
    avgBedtimeMinutes -= 24 * 60;
  }

  // 平均睡眠時間を計算
  const durations = monthlyRecords
    .filter(r => r.duration !== null)
    .map(r => r.duration);

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  return {
    count: monthlyRecords.length,
    avgWakeTime: avgWakeMinutes !== null
      ? `${Math.floor(avgWakeMinutes / 60).toString().padStart(2, '0')}:${(avgWakeMinutes % 60).toString().padStart(2, '0')}`
      : null,
    avgBedtime: avgBedtimeMinutes !== null
      ? `${Math.floor(avgBedtimeMinutes / 60).toString().padStart(2, '0')}:${(avgBedtimeMinutes % 60).toString().padStart(2, '0')}`
      : null,
    avgDuration,
  };
};
