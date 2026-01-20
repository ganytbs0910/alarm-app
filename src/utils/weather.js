// Open-Meteo API（無料、APIキー不要）
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// デフォルト座標（東京）
const DEFAULT_LOCATION = {
  latitude: 35.6762,
  longitude: 139.6503,
};

// 位置情報を取得
// 本番環境: 端末の位置情報を使用
// 開発環境: 東京の座標を使用
const getLocation = async () => {
  // 開発環境では東京の座標を使用
  if (__DEV__) {
    console.log('Development mode: using Tokyo location');
    return DEFAULT_LOCATION;
  }

  // 本番環境では端末の位置情報を使用
  try {
    const Location = require('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Location permission denied, using default location');
      return DEFAULT_LOCATION;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.log('Location error, using default:', error.message);
    return DEFAULT_LOCATION;
  }
};

// 天気データを取得
export const getWeatherData = async () => {
  try {
    const location = await getLocation();

    const params = new URLSearchParams({
      latitude: location.latitude,
      longitude: location.longitude,
      daily: 'precipitation_probability_max,weather_code',
      timezone: 'Asia/Tokyo',
      forecast_days: '1',
    });

    const response = await fetch(`${OPEN_METEO_URL}?${params}`);
    const data = await response.json();

    if (data.daily) {
      const precipitationProbability = data.daily.precipitation_probability_max[0];
      const weatherCode = data.daily.weather_code[0];

      return {
        precipitationProbability,
        weatherCode,
        needsUmbrella: precipitationProbability >= 30,
        weatherDescription: getWeatherDescription(weatherCode),
      };
    }

    return null;
  } catch (error) {
    console.log('Weather fetch error:', error);
    return null;
  }
};

// 天気コードから説明を取得
const getWeatherDescription = (code) => {
  const weatherCodes = {
    0: '晴れ',
    1: 'ほぼ晴れ',
    2: '一部曇り',
    3: '曇り',
    45: '霧',
    48: '霧氷',
    51: '小雨',
    53: '雨',
    55: '強い雨',
    56: '凍る霧雨',
    57: '強い凍る霧雨',
    61: '小雨',
    63: '雨',
    65: '強い雨',
    66: '凍る雨',
    67: '強い凍る雨',
    71: '小雪',
    73: '雪',
    75: '強い雪',
    77: '霧雪',
    80: 'にわか雨',
    81: 'にわか雨',
    82: '激しいにわか雨',
    85: '小雪',
    86: '強い雪',
    95: '雷雨',
    96: '雹を伴う雷雨',
    99: '強い雹を伴う雷雨',
  };

  return weatherCodes[code] || '不明';
};

// 傘が必要かどうかのメッセージを取得
export const getUmbrellaMessage = (weatherData) => {
  if (!weatherData) {
    return { message: '天気を取得中...', icon: '...' };
  }

  const { precipitationProbability, needsUmbrella, weatherDescription } = weatherData;

  if (needsUmbrella) {
    if (precipitationProbability >= 70) {
      return {
        message: `傘必須！ ${weatherDescription} (${precipitationProbability}%)`,
        icon: '☔',
        needsUmbrella: true,
      };
    }
    return {
      message: `傘があると安心 ${weatherDescription} (${precipitationProbability}%)`,
      icon: '🌂',
      needsUmbrella: true,
    };
  }

  return {
    message: `傘は不要 ${weatherDescription}`,
    icon: '☀️',
    needsUmbrella: false,
  };
};
