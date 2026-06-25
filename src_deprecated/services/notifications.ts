import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiFetch } from './api';

// 配置通知处理行为
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

class NotificationService {
  private expoPushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;

  /**
   * 初始化推送通知
   */
  async initialize(): Promise<string | null> {
    try {
      // 检查是否是真实设备
      if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return null;
      }

      // 获取权限
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }

      // 获取 Expo Push Token
      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // 替换为实际 projectId
      });
      this.expoPushToken = tokenResponse.data;

      // Android 需要设置通知渠道
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }

      // 注册 token 到后端
      await this.registerTokenWithBackend(this.expoPushToken);

      return this.expoPushToken;
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
      return null;
    }
  }

  /**
   * 设置 Android 通知渠道
   */
  private async setupAndroidChannels() {
    // 空投通知
    await Notifications.setNotificationChannelAsync('airdrops', {
      name: '空投提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
    });

    // 收益通知
    await Notifications.setNotificationChannelAsync('earnings', {
      name: '收益到账',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#10B981',
    });

    // 交易通知
    await Notifications.setNotificationChannelAsync('transactions', {
      name: '交易通知',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
    });

    // 商户通知
    await Notifications.setNotificationChannelAsync('merchant', {
      name: '商户消息',
      importance: Notifications.AndroidImportance.DEFAULT,
    });

    // 开发者通知
    await Notifications.setNotificationChannelAsync('developer', {
      name: '开发者消息',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  /**
   * 注册 Token 到后端
   */
  private async registerTokenWithBackend(token: string) {
    try {
      await apiFetch('/notifications/register', {
        method: 'POST',
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          deviceId: Device.modelId || 'unknown',
        }),
      });
      console.log('Push token registered with backend');
    } catch (error) {
      console.warn('Failed to register push token:', error);
    }
  }

  /**
   * 添加通知监听器
   */
  addListeners(
    onNotification: (notification: Notifications.Notification) => void,
    onNotificationResponse: (response: Notifications.NotificationResponse) => void,
  ) {
    // 收到通知时触发（应用在前台）
    this.notificationListener = Notifications.addNotificationReceivedListener(onNotification);

    // 用户点击通知时触发
    this.responseListener = Notifications.addNotificationResponseReceivedListener(onNotificationResponse);
  }

  /**
   * 移除监听器
   */
  removeListeners() {
    if (this.notificationListener) {
      this.notificationListener.remove?.();
    }
    if (this.responseListener) {
      this.responseListener.remove?.();
    }
  }

  /**
   * 发送本地通知（用于测试或即时提醒）
   */
  async sendLocalNotification(params: {
    title: string;
    body: string;
    data?: Record<string, any>;
    channelId?: string;
  }) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        data: params.data || {},
        ...(Platform.OS === 'android' && params.channelId
          ? { channelId: params.channelId }
          : {}),
      },
      trigger: null, // 立即发送
    });
  }

  /**
   * 获取当前 Push Token
   */
  getToken() {
    return this.expoPushToken;
  }

  /**
   * 获取所有待处理的通知
   */
  async getPendingNotifications() {
    return Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * 取消所有通知
   */
  async cancelAllNotifications() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * 设置应用 Badge 数量
   */
  async setBadgeCount(count: number) {
    await Notifications.setBadgeCountAsync(count);
  }

  /**
   * 获取通知设置
   */
  async getSettings() {
    return Notifications.getPermissionsAsync();
  }
}

export const notificationService = new NotificationService();

// 通知类型定义
export type NotificationType = 
  | 'airdrop_available'    // 新空投可领
  | 'airdrop_claimed'      // 空投已领取
  | 'earning_received'     // 收益到账
  | 'payment_received'     // 收款到账
  | 'payment_sent'         // 付款成功
  | 'task_assigned'        // 任务分配
  | 'task_completed'       // 任务完成
  | 'milestone_approved'   // 里程碑通过
  | 'settlement_ready';    // 结算就绪

// 通知数据结构
export interface NotificationData {
  type: NotificationType;
  [key: string]: any;
}

/**
 * 处理通知点击，导航到对应页面
 */
export function handleNotificationNavigation(
  data: NotificationData,
  navigation: any,
) {
  switch (data.type) {
    case 'airdrop_available':
    case 'airdrop_claimed':
      navigation.navigate('Airdrop');
      break;
    case 'earning_received':
      navigation.navigate('AutoEarn');
      break;
    case 'payment_received':
    case 'payment_sent':
      navigation.navigate('Activity');
      break;
    case 'task_assigned':
    case 'task_completed':
      navigation.navigate('TaskMarket');
      break;
    case 'milestone_approved':
      navigation.navigate('BudgetPools');
      break;
    case 'settlement_ready':
      navigation.navigate('Settlements');
      break;
    default:
      navigation.navigate('Home');
  }
}
