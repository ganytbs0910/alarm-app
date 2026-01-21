import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  flushFailedPurchasesCachedAsPendingAndroid,
} from 'react-native-iap';
import {
  PRODUCT_IDS,
  activateSubscription,
  restoreSubscription,
  getSubscription,
} from '../storage/subscriptionStorage';

// サブスクリプションの商品ID配列
const subscriptionSkus = [PRODUCT_IDS.MONTHLY, PRODUCT_IDS.YEARLY];

// 商品情報のキャッシュ
let cachedProducts = null;

// IAP接続状態
let isConnected = false;

// 購入リスナー
let purchaseUpdateSubscription = null;
let purchaseErrorSubscription = null;

// IAPに接続
export const connectToIAP = async () => {
  try {
    const result = await initConnection();
    isConnected = true;
    console.log('IAP connected:', result);

    // Androidの場合、失敗した購入をクリア
    if (Platform.OS === 'android') {
      await flushFailedPurchasesCachedAsPendingAndroid();
    }

    return true;
  } catch (error) {
    console.error('Error connecting to IAP:', error);
    isConnected = false;
    return false;
  }
};

// IAP接続を切断
export const disconnectFromIAP = async () => {
  try {
    // リスナーを解除
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }

    await endConnection();
    isConnected = false;
    console.log('IAP disconnected');
  } catch (error) {
    console.error('Error disconnecting from IAP:', error);
  }
};

// 商品情報を取得
export const getProductsFromStore = async () => {
  if (!isConnected) {
    console.log('IAP not connected');
    return [];
  }

  if (cachedProducts) {
    return cachedProducts;
  }

  try {
    // サブスクリプション商品を取得
    const products = await getSubscriptions({ skus: subscriptionSkus });
    console.log('Products fetched:', products);

    cachedProducts = products.map(product => ({
      productId: product.productId,
      title: product.title,
      description: product.description,
      price: product.localizedPrice,
      priceAmountMicros: product.price,
      priceCurrencyCode: product.currency,
      subscriptionPeriod: product.subscriptionPeriodAndroid || product.subscriptionPeriodIOS,
    }));

    return cachedProducts;
  } catch (error) {
    console.error('Error getting products:', error);
    return [];
  }
};

// 購入処理
export const purchaseProduct = async (productId) => {
  if (!isConnected) {
    return {
      success: false,
      error: 'IAP not available',
    };
  }

  return new Promise((resolve) => {
    // 購入成功リスナー
    purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase) => {
      console.log('Purchase updated:', purchase);

      if (purchase.productId === productId) {
        try {
          // 購入を完了
          await finishTransaction({ purchase, isConsumable: false });

          // サブスクリプションを有効化
          const expirationDate = new Date();
          if (productId === PRODUCT_IDS.MONTHLY) {
            expirationDate.setMonth(expirationDate.getMonth() + 1);
          } else {
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
          }

          const subscription = await activateSubscription(
            productId,
            purchase.transactionId,
            expirationDate
          );

          // リスナーを解除
          if (purchaseUpdateSubscription) {
            purchaseUpdateSubscription.remove();
            purchaseUpdateSubscription = null;
          }
          if (purchaseErrorSubscription) {
            purchaseErrorSubscription.remove();
            purchaseErrorSubscription = null;
          }

          resolve({ success: true, subscription });
        } catch (error) {
          console.error('Error finishing transaction:', error);
          resolve({ success: false, error: error.message });
        }
      }
    });

    // 購入エラーリスナー
    purchaseErrorSubscription = purchaseErrorListener((error) => {
      console.log('Purchase error:', error);

      // リスナーを解除
      if (purchaseUpdateSubscription) {
        purchaseUpdateSubscription.remove();
        purchaseUpdateSubscription = null;
      }
      if (purchaseErrorSubscription) {
        purchaseErrorSubscription.remove();
        purchaseErrorSubscription = null;
      }

      if (error.code === 'E_USER_CANCELLED') {
        resolve({ success: false, error: 'canceled' });
      } else {
        resolve({ success: false, error: error.message || 'Unknown error' });
      }
    });

    // 購入を開始
    requestSubscription(productId).catch((error) => {
      console.error('Error requesting subscription:', error);

      // リスナーを解除
      if (purchaseUpdateSubscription) {
        purchaseUpdateSubscription.remove();
        purchaseUpdateSubscription = null;
      }
      if (purchaseErrorSubscription) {
        purchaseErrorSubscription.remove();
        purchaseErrorSubscription = null;
      }

      if (error.code === 'E_USER_CANCELLED') {
        resolve({ success: false, error: 'canceled' });
      } else {
        resolve({ success: false, error: error.message || 'Unknown error' });
      }
    });
  });
};

// 購入を復元
export const restorePurchases = async () => {
  if (!isConnected) {
    return {
      success: false,
      error: 'IAP not available',
    };
  }

  try {
    const purchases = await getAvailablePurchases();
    console.log('Available purchases:', purchases);

    if (purchases && purchases.length > 0) {
      // サブスクリプション商品のみフィルタ
      const subscriptionPurchases = purchases.filter(p =>
        subscriptionSkus.includes(p.productId)
      );

      if (subscriptionPurchases.length > 0) {
        const subscription = await restoreSubscription(subscriptionPurchases);
        if (subscription) {
          return {
            success: true,
            subscription,
            restored: true,
          };
        }
      }
    }

    return {
      success: true,
      subscription: await getSubscription(),
      restored: false,
    };
  } catch (error) {
    console.error('Error restoring purchases:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
};

// 購入履歴を取得
export const getPurchaseHistory = async () => {
  if (!isConnected) {
    return [];
  }

  try {
    const purchases = await getAvailablePurchases();
    return purchases || [];
  } catch (error) {
    console.error('Error getting purchase history:', error);
    return [];
  }
};

// サブスクリプションの有効性を確認
export const validateSubscription = async () => {
  const subscription = await getSubscription();

  if (!subscription.isActive) {
    return { isValid: false, subscription };
  }

  // 有効期限をチェック
  if (subscription.expirationDate) {
    const expDate = new Date(subscription.expirationDate);
    if (expDate < new Date()) {
      return { isValid: false, subscription };
    }
  }

  return { isValid: true, subscription };
};

// エクスポート名の互換性のため（App.jsで使用）
export { getProductsFromStore as getProducts };
