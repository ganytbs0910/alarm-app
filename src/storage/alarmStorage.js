import AsyncStorage from '@react-native-async-storage/async-storage';

const ALARMS_KEY = 'alarms_v2';

// アラームタイプ
export const ALARM_TYPES = {
  DAILY: 'daily',      // 毎日アラーム
  QUICK: 'quick',      // 今すぐアラーム
  WAKEUP: 'wakeup',    // 起きるまでアラーム
};

export const getAlarms = async () => {
  try {
    const json = await AsyncStorage.getItem(ALARMS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('Failed to load alarms:', e);
    return [];
  }
};

export const saveAlarms = async (alarms) => {
  try {
    await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
  } catch (e) {
    console.error('Failed to save alarms:', e);
  }
};

export const addAlarm = async (alarm) => {
  const alarms = await getAlarms();
  const newAlarm = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    enabled: true,
    ...alarm,
  };
  alarms.push(newAlarm);
  await saveAlarms(alarms);
  return newAlarm;
};

export const updateAlarm = async (id, updates) => {
  const alarms = await getAlarms();
  const index = alarms.findIndex((a) => a.id === id);
  if (index !== -1) {
    alarms[index] = { ...alarms[index], ...updates };
    await saveAlarms(alarms);
  }
  return alarms;
};

export const deleteAlarm = async (id) => {
  const alarms = await getAlarms();
  const filtered = alarms.filter((a) => a.id !== id);
  await saveAlarms(filtered);
  return filtered;
};

export const getAlarmsByType = async (type) => {
  const alarms = await getAlarms();
  return alarms.filter((a) => a.type === type);
};
