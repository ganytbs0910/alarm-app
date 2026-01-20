import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

// 本番環境でのみ広告ライブラリをインポート
let BannerAd, BannerAdSize, TestIds;
if (!__DEV__) {
  try {
    const ads = require('react-native-google-mobile-ads');
    BannerAd = ads.BannerAd;
    BannerAdSize = ads.BannerAdSize;
    TestIds = ads.TestIds;
  } catch (e) {
    console.log('AdMob library not available:', e);
  }
}

// 広告ユニットID
const BANNER_AD_UNIT_ID = 'ca-app-pub-4317478239934902/3522055335';

const BannerAdComponent = ({ isPremium }) => {
  // プレミアムユーザーは広告非表示
  if (isPremium) {
    return null;
  }

  // 開発環境ではモック広告を表示
  if (__DEV__ || !BannerAd) {
    return (
      <View style={styles.mockBanner}>
        <Text style={styles.mockText}>広告バナー (開発モード)</Text>
      </View>
    );
  }

  // 本番環境では実際のAdMob広告を表示
  return (
    <View style={styles.bannerContainer}>
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          console.log('Banner ad loaded');
        }}
        onAdFailedToLoad={(error) => {
          console.log('Banner ad failed to load:', error);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  mockBanner: {
    height: 50,
    backgroundColor: '#2c2c2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
  },
  mockText: {
    color: '#666',
    fontSize: 12,
  },
});

export default BannerAdComponent;
