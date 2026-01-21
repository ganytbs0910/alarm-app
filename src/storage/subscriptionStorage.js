import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTION_KEY = '@alarm_subscription';

// サブスクリプションのステータス
export const SUBSCRIPTION_STATUS = {
  FREE: 'free',
  PREMIUM_MONTHLY: 'premium_monthly',
  PREMIUM_YEARLY: 'premium_yearly',
};

// プロダクトID（App Store Connect / Google Play Consoleで設定するID）
export const PRODUCT_IDS = {
  MONTHLY: 'com.gan0910.alarm.premium.monthly',
  YEARLY: 'com.gan0910.alarm.premium.yearly',
};

// デフォルトのサブスクリプション状態
const defaultSubscription = {
  status: SUBSCRIPTION_STATUS.FREE,
  productId: null,
  purchaseDate: null,
  expirationDate: null,
  transactionId: null,
  isActive: false,
};

// サブスクリプション情報を取得
export const getSubscription = async () => {
  try {
    const data = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
    if (data) {
      const subscription = JSON.parse(data);
      // 有効期限をチェック
      if (subscription.expirationDate) {
        const expDate = new Date(subscription.expirationDate);
        if (expDate < new Date()) {
          // 期限切れの場合はフリーに戻す
          subscription.isActive = false;
          subscription.status = SUBSCRIPTION_STATUS.FREE;
          await saveSubscription(subscription);
        }
      }
      return subscription;
    }
    return defaultSubscription;
  } catch (error) {
    console.error('Error getting subscription:', error);
    return defaultSubscription;
  }
};

// サブスクリプション情報を保存
export const saveSubscription = async (subscription) => {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
    return true;
  } catch (error) {
    console.error('Error saving subscription:', error);
    return false;
  }
};

// プレミアムステータスを確認
export const isPremiumActive = async () => {
  const subscription = await getSubscription();
  return subscription.isActive && subscription.status !== SUBSCRIPTION_STATUS.FREE;
};

// サブスクリプションを更新（購入成功時）
export const activateSubscription = async (productId, transactionId, expirationDate) => {
  const status = productId === PRODUCT_IDS.MONTHLY
    ? SUBSCRIPTION_STATUS.PREMIUM_MONTHLY
    : SUBSCRIPTION_STATUS.PREMIUM_YEARLY;

  const subscription = {
    status,
    productId,
    purchaseDate: new Date().toISOString(),
    expirationDate: expirationDate ? expirationDate.toISOString() : null,
    transactionId,
    isActive: true,
  };

  await saveSubscription(subscription);
  return subscription;
};

// サブスクリプションをキャンセル（デバッグ用）
export const cancelSubscription = async () => {
  await saveSubscription(defaultSubscription);
  return defaultSubscription;
};

// 購入履歴からサブスクリプションを復元
export const restoreSubscription = async (purchases) => {
  if (!purchases || purchases.length === 0) {
    return null;
  }

  // 最新の有効な購入を探す
  const validPurchase = purchases
    .filter(p => p.productId && Object.values(PRODUCT_IDS).includes(p.productId))
    .sort((a, b) => new Date(b.purchaseTime) - new Date(a.purchaseTime))
    [0];

  if (validPurchase) {
    return await activateSubscription(
      validPurchase.productId,
      validPurchase.transactionId || validPurchase.orderId,
      validPurchase.expirationDate ? new Date(validPurchase.expirationDate) : null
    );
  }

  return null;
};
