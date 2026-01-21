import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

// 広告ライブラリをインポート
let BannerAd, BannerAdSize;
try {
  const ads = require('react-native-google-mobile-ads');
  BannerAd = ads.BannerAd;
  BannerAdSize = ads.BannerAdSize;
} catch (e) {
  console.log('AdMob library not available:', e);
}

// 広告ユニットID
const BANNER_AD_UNIT_ID = 'ca-app-pub-4317478239934902/3522055335';

const BannerAdComponent = ({ isPremium }) => {
  // プレミアムユーザーは広告非表示
  if (isPremium) {
    return null;
  }

  // 広告ライブラリが利用できない場合は何も表示しない
  if (!BannerAd) {
    return null;
  }

  // AdMob広告を表示
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
    backgroundColor: '#1c1c1e',
    paddingVertical: 4,
  },
});

export default BannerAdComponent;
