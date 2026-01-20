// Open-Meteo API（無料、APIキー不要）
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// デフォルト座標（東京）
const DEFAULT_LOCATION = {
  latitude: 35.6762,
  longitude: 139.6503,
};

// 位置情報を取得
const getLocation = async () => {
  if (__DEV__) {
    return DEFAULT_LOCATION;
  }

  try {
    const Location = require('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
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
    return DEFAULT_LOCATION;
  }
};

// 今日の降水確率を取得
export const getWeatherData = async () => {
  try {
    const location = await getLocation();

    const params = new URLSearchParams({
      latitude: location.latitude,
      longitude: location.longitude,
      daily: 'precipitation_probability_max',
      timezone: 'Asia/Tokyo',
      forecast_days: '1',
    });

    const response = await fetch(`${OPEN_METEO_URL}?${params}`);
    const data = await response.json();

    if (data.daily) {
      const probability = data.daily.precipitation_probability_max[0];
      return { probability };
    }

    return null;
  } catch (error) {
    return null;
  }
};

// 天気状態を判定（rain, cloudy, sunny）
export const getWeatherStatus = (data) => {
  if (!data) return null;
  const p = data.probability;
  if (p >= 70) return 'rain';
  if (p >= 30) return 'cloudy';
  return 'sunny';
};
