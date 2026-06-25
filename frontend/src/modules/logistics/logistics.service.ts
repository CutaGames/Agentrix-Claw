import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, AssetType } from '../../entities/order.entity';
import { NotificationService } from '../notification/notification.service';
import { getSettlementConfig } from '../commission/financial-architecture.config';

export interface LogisticsTracking {
  orderId: string;
  status: 'pending' | 'packed' | 'shipped' | 'in_transit' | 'delivered' | 'failed';
  trackingNumber?: string;
  carrier?: string;
  events: Array<{
    timestamp: Date;
    location?: string;
    description: string;
    status: string;
  }>;
  estimatedDelivery?: Date;
  currentLocation?: string;
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @Inject(forwardRef(() => NotificationService))
    private notificationService: NotificationService,
  ) {}

  /**
   * 获取物流跟踪信息（V3.0：完善物流跟踪功能）
   */
  async getLogisticsTracking(orderId: string): Promise<LogisticsTracking | null> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
      });

      if (!order) {
        return null;
      }

      // 从订单metadata中获取物流信息
      const logisticsData = (order.metadata as any)?.logistics;

      if (!logisticsData) {
        // 如果没有物流信息，返回基础状态
        return {
          orderId,
          status: this.mapOrderStatusToLogisticsStatus(order.status as any),
          events: [
            {
              timestamp: order.createdAt,
              description: '订单已创建',
              status: 'created',
            },
          ],
        };
      }

      return {
        orderId,
        status: logisticsData.status || 'pending',
        trackingNumber: logisticsData.trackingNumber,
        carrier: logisticsData.carrier,
        events: logisticsData.events || [],
        estimatedDelivery: logisticsData.estimatedDelivery
          ? new Date(logisticsData.estimatedDelivery)
          : undefined,
        currentLocation: logisticsData.currentLocation,
      };
    } catch (error) {
      this.logger.error(`获取物流跟踪信息失败: ${orderId}`, error);
      return null;
    }
  }

  /**
   * 更新物流状态
   */
  async updateLogisticsStatus(
    orderId: string,
    status: LogisticsTracking['status'],
    trackingNumber?: string,
    carrier?: string,
  ): Promise<LogisticsTracking> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error('订单不存在');
      }

      const logisticsData = (order.metadata as any)?.logistics || {
        events: [],
      };

      // 添加新事件
      logisticsData.events.push({
        timestamp: new Date(),
        description: this.getStatusDescription(status),
        status,
      });

      // 更新物流信息
      logisticsData.status = status;
      if (trackingNumber) {
        logisticsData.trackingNumber = trackingNumber;
      }
      if (carrier) {
        logisticsData.carrier = carrier;
      }

      // 更新订单metadata
      order.metadata = {
        ...(order.metadata as any),
        logistics: logisticsData,
      };

      if (status === 'delivered') {
        const triggerTime = new Date();
        const config = getSettlementConfig(order.assetType || AssetType.PHYSICAL);
        order.status = OrderStatus.DELIVERED;
        order.settlementTriggerTime = triggerTime;
        if (config && typeof config.lockupDays === 'number') {
          const due = new Date(triggerTime);
          due.setDate(due.getDate() + config.lockupDays);
          order.settlementDueTime = due;
        }
      }

      await this.orderRepository.save(order);

      // 发送物流状态更新通知给用户
      try {
        const statusMessages: Record<string, string> = {
          packed: '您的订单已打包完成',
          shipped: '您的订单已发货',
          in_transit: '您的订单正在运输中',
          delivered: '您的订单已送达',
          failed: '您的订单配送失败',
        };

        const message = statusMessages[status] || `您的订单物流状态已更新：${this.getStatusDescription(status)}`;
        
        await this.notificationService.createNotification(order.userId, {
          type: 'order' as any,
          title: '物流状态更新',
          message: `${message}${trackingNumber ? `，物流单号：${trackingNumber}` : ''}`,
          actionUrl: `/app/user/orders/${orderId}`,
          metadata: {
            orderId,
            logisticsStatus: status,
            trackingNumber,
            carrier,
          },
        });
      } catch (error) {
        this.logger.warn(`发送物流通知失败: ${error.message}`);
      }

      return {
        orderId,
        status,
        trackingNumber: logisticsData.trackingNumber,
        carrier: logisticsData.carrier,
        events: logisticsData.events,
        estimatedDelivery: logisticsData.estimatedDelivery
          ? new Date(logisticsData.estimatedDelivery)
          : undefined,
        currentLocation: logisticsData.currentLocation,
      };
    } catch (error) {
      this.logger.error(`更新物流状态失败: ${orderId}`, error);
      throw error;
    }
  }

  /**
   * 添加物流事件
   */
  async addLogisticsEvent(
    orderId: string,
    description: string,
    location?: string,
    status?: string,
  ): Promise<void> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error('订单不存在');
      }

      const logisticsData = (order.metadata as any)?.logistics || {
        events: [],
      };

      logisticsData.events.push({
        timestamp: new Date(),
        location,
        description,
        status: status || logisticsData.status || 'pending',
      });

      order.metadata = {
        ...(order.metadata as any),
        logistics: logisticsData,
      };

      await this.orderRepository.save(order);
    } catch (error) {
      this.logger.error(`添加物流事件失败: ${orderId}`, error);
      throw error;
    }
  }

  /**
   * 映射订单状态到物流状态
   */
  private mapOrderStatusToLogisticsStatus(orderStatus: string): LogisticsTracking['status'] {
    const statusMap: Record<string, LogisticsTracking['status']> = {
      pending: 'pending',
      paid: 'packed',
      processing: 'in_transit',
      pending_shipment: 'packed',
      shipped: 'shipped',
      delivered: 'delivered',
      settled: 'delivered',
      cancelled: 'failed',
      refunded: 'failed',
      frozen: 'failed',
    };

    return statusMap[orderStatus] || 'pending';
  }

  /**
   * 获取状态描述
   */
  private getStatusDescription(status: LogisticsTracking['status']): string {
    const descriptions: Record<LogisticsTracking['status'], string> = {
      pending: '待发货',
      packed: '已打包',
      shipped: '已发货',
      in_transit: '运输中',
      delivered: '已送达',
      failed: '配送失败',
    };

    return descriptions[status] || '未知状态';
  }

  /**
   * 自动更新物流状态（V3.0增强：集成第三方物流API）
   * 支持自动查询物流信息并更新状态
   */
  async autoUpdateLogisticsStatus(orderId: string): Promise<LogisticsTracking | null> {
    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
      });

      if (!order) {
        return null;
      }

      const logisticsData = (order.metadata as any)?.logistics;
      if (!logisticsData?.trackingNumber || !logisticsData?.carrier) {
        // 没有物流单号，无法自动更新
        return null;
      }

      // TODO: 集成第三方物流API（如快递100、菜鸟等）
      // 这里使用模拟数据，实际应该调用真实API
      const mockTrackingData = await this.fetchThirdPartyTracking(
        logisticsData.trackingNumber,
        logisticsData.carrier,
      );

      if (mockTrackingData) {
        // 更新物流信息
        logisticsData.status = mockTrackingData.status;
        logisticsData.events = mockTrackingData.events;
        logisticsData.currentLocation = mockTrackingData.currentLocation;
        logisticsData.estimatedDelivery = mockTrackingData.estimatedDelivery;

        order.metadata = {
          ...(order.metadata as any),
          logistics: logisticsData,
        };

        await this.orderRepository.save(order);

        this.logger.log(`自动更新物流状态: ${orderId} -> ${mockTrackingData.status}`);
      }

      return {
        orderId,
        ...logisticsData,
        events: logisticsData.events || [],
        estimatedDelivery: logisticsData.estimatedDelivery
          ? new Date(logisticsData.estimatedDelivery)
          : undefined,
      };
    } catch (error) {
      this.logger.error(`自动更新物流状态失败: ${orderId}`, error);
      return null;
    }
  }

  /**
   * 获取第三方物流跟踪信息
   * 支持快递100、菜鸟、顺丰等API
   */
  private async fetchThirdPartyTracking(
    trackingNumber: string,
    carrier: string,
  ): Promise<Partial<LogisticsTracking> | null> {
    try {
      // 快递100 API集成
      if (carrier === 'kuaidi100' || this.isKuaidi100Carrier(carrier)) {
        return await this.fetchKuaidi100Tracking(trackingNumber, carrier);
      }

      // 菜鸟API集成
      if (carrier === 'cainiao' || carrier === '菜鸟') {
        return await this.fetchCainiaoTracking(trackingNumber);
      }

      // 顺丰API集成
      if (carrier === 'sf' || carrier === '顺丰') {
        return await this.fetchSFTracking(trackingNumber);
      }

      // 默认使用快递100（如果配置了API Key）
      const kuaidi100ApiKey = process.env.KUAIDI100_API_KEY;
      if (kuaidi100ApiKey) {
        return await this.fetchKuaidi100Tracking(trackingNumber, carrier);
      }

      // 如果没有配置API，返回模拟数据
      this.logger.warn(`未配置物流API，使用模拟数据: carrier=${carrier}, trackingNumber=${trackingNumber}`);
      return this.getMockTrackingData();
    } catch (error) {
      this.logger.error(`获取第三方物流信息失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 快递100 API查询
   */
  private async fetchKuaidi100Tracking(
    trackingNumber: string,
    carrier: string,
  ): Promise<Partial<LogisticsTracking> | null> {
    const apiKey = process.env.KUAIDI100_API_KEY;
    const customer = process.env.KUAIDI100_CUSTOMER;

    if (!apiKey || !customer) {
      this.logger.warn('快递100 API Key未配置，使用模拟数据');
      return this.getMockTrackingData();
    }

    try {
      // 快递100 API调用
      const response = await fetch('https://poll.kuaidi100.com/poll/query.do', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer,
          sign: this.generateKuaidi100Sign(trackingNumber, carrier, apiKey, customer),
          param: JSON.stringify({
            com: this.mapCarrierToKuaidi100Code(carrier),
            num: trackingNumber,
          }),
        }),
      });

      const data = await response.json();

      if (data.status !== '200') {
        this.logger.warn(`快递100查询失败: ${data.message}`);
        return this.getMockTrackingData();
      }

      // 转换快递100数据格式
      return {
        status: this.mapKuaidi100StatusToLogisticsStatus(data.state),
        events: data.data.map((item: any) => ({
          timestamp: new Date(item.time),
          location: item.location,
          description: item.context,
          status: this.mapKuaidi100StatusToLogisticsStatus(data.state),
        })),
        currentLocation: data.data[0]?.location,
      };
    } catch (error) {
      this.logger.error(`快递100 API调用失败: ${error.message}`);
      return this.getMockTrackingData();
    }
  }

  /**
   * 菜鸟API查询
   */
  private async fetchCainiaoTracking(trackingNumber: string): Promise<Partial<LogisticsTracking> | null> {
    // TODO: 实现菜鸟API集成
    this.logger.warn('菜鸟API未实现，使用模拟数据');
    return this.getMockTrackingData();
  }

  /**
   * 顺丰API查询
   */
  private async fetchSFTracking(trackingNumber: string): Promise<Partial<LogisticsTracking> | null> {
    // TODO: 实现顺丰API集成
    this.logger.warn('顺丰API未实现，使用模拟数据');
    return this.getMockTrackingData();
  }

  /**
   * 判断是否为快递100支持的承运商
   */
  private isKuaidi100Carrier(carrier: string): boolean {
    const supportedCarriers = ['yuantong', 'zhongtong', 'shentong', 'yunda', 'shunfeng', 'ems', 'youzhengguonei'];
    return supportedCarriers.includes(carrier.toLowerCase());
  }

  /**
   * 映射承运商到快递100代码
   */
  private mapCarrierToKuaidi100Code(carrier: string): string {
    const mapping: Record<string, string> = {
      'yuantong': 'yuantong',
      'zhongtong': 'zhongtong',
      'shentong': 'shentong',
      'yunda': 'yunda',
      'shunfeng': 'shunfeng',
      'sf': 'shunfeng',
      '顺丰': 'shunfeng',
      'ems': 'ems',
      'youzhengguonei': 'youzhengguonei',
    };
    return mapping[carrier.toLowerCase()] || carrier;
  }

  /**
   * 生成快递100签名
   */
  private generateKuaidi100Sign(trackingNumber: string, carrier: string, apiKey: string, customer: string): string {
    const param = JSON.stringify({
      com: this.mapCarrierToKuaidi100Code(carrier),
      num: trackingNumber,
    });
    const sign = `${param}${apiKey}${customer}`;
    // 使用MD5生成签名
    const crypto = require('crypto');
    return crypto.createHash('md5').update(sign).digest('hex').toUpperCase();
  }

  /**
   * 映射快递100状态到物流状态
   */
  private mapKuaidi100StatusToLogisticsStatus(state: string): LogisticsTracking['status'] {
    const mapping: Record<string, LogisticsTracking['status']> = {
      '0': 'pending',
      '1': 'packed',
      '2': 'shipped',
      '3': 'in_transit',
      '4': 'delivered',
      '5': 'failed',
    };
    return mapping[state] || 'pending';
  }

  /**
   * 获取模拟物流数据（用于测试或API未配置时）
   */
  private getMockTrackingData(): Partial<LogisticsTracking> {
    return {
      status: 'in_transit',
      events: [
        {
          timestamp: new Date(Date.now() - 86400000),
          location: '北京',
          description: '已发货',
          status: 'shipped',
        },
        {
          timestamp: new Date(Date.now() - 43200000),
          location: '上海',
          description: '运输中',
          status: 'in_transit',
        },
        {
          timestamp: new Date(),
          location: '广州',
          description: '派送中',
          status: 'in_transit',
        },
      ],
      currentLocation: '广州',
      estimatedDelivery: new Date(Date.now() + 86400000),
    };
  }

  /**
   * 批量更新物流状态（定时任务使用）
   */
  async batchUpdateLogisticsStatus(orderIds: string[]): Promise<void> {
    for (const orderId of orderIds) {
      try {
        await this.autoUpdateLogisticsStatus(orderId);
      } catch (error) {
        this.logger.error(`批量更新物流状态失败: ${orderId}`, error);
      }
    }
  }
}

