import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Mock API控制器 - 用于官网功能演示
 * 所有功能使用MOCK数据，确保链路通畅
 * 后续逐步替换为真实实现
 */
@ApiTags('mock-website')
@Controller('mock/website')
export class MockWebsiteController {
  /**
   * 获取统计数据（首页Stats组件）
   */
  @Get('stats')
  @ApiOperation({ summary: '获取网站统计数据（MOCK）' })
  @ApiResponse({ status: 200, description: '返回统计数据' })
  async getStats() {
    // MOCK数据
    return {
      totalAgents: 1234,
      totalTransactions: 56789,
      totalGMV: '¥12.5M',
      activeMerchants: 456,
      totalUsers: 8901,
    };
  }

  /**
   * 提交联系表单
   */
  @Post('contact')
  @ApiOperation({ summary: '提交联系表单（MOCK）' })
  @ApiResponse({ status: 200, description: '提交成功' })
  async submitContact(@Body() body: { name: string; email: string; message: string }) {
    // MOCK: 模拟提交
    console.log('Contact form submitted:', body);
    return {
      success: true,
      message: '感谢您的留言，我们会尽快回复！',
    };
  }

  /**
   * 订阅邮件
   */
  @Post('subscribe')
  @ApiOperation({ summary: '订阅邮件（MOCK）' })
  @ApiResponse({ status: 200, description: '订阅成功' })
  async subscribe(@Body() body: { email: string }) {
    // MOCK: 模拟订阅
    console.log('Email subscription:', body.email);
    return {
      success: true,
      message: '订阅成功！',
    };
  }

  /**
   * 下载资源（白皮书、SDK等）
   */
  @Get('download')
  @ApiOperation({ summary: '下载资源（MOCK）' })
  @ApiResponse({ status: 200, description: '返回下载链接' })
  async download(@Query('type') type: string) {
    // MOCK: 返回下载链接
    const downloads: Record<string, string> = {
      whitepaper: 'https://agentrix.ai/downloads/whitepaper.pdf',
      sdk: 'https://agentrix.ai/downloads/sdk.zip',
      api_docs: 'https://agentrix.ai/downloads/api-docs.pdf',
    };

    return {
      success: true,
      url: downloads[type] || downloads.whitepaper,
      message: '下载链接已生成',
    };
  }

  /**
   * 获取产品演示数据
   */
  @Get('demo/products')
  @ApiOperation({ summary: '获取产品演示数据（MOCK）' })
  @ApiResponse({ status: 200, description: '返回产品列表' })
  async getDemoProducts(@Query('category') category?: string) {
    // MOCK产品数据
    const products = [
      {
        id: 'prod-1',
        name: '联想 Yoga 14s 笔记本电脑',
        description: '14英寸 2.8K高分辨率屏幕',
        price: 5999,
        currency: 'CNY',
        category: 'electronics',
        merchant: '联想官方旗舰店',
        rating: 4.8,
        stock: 15,
      },
      {
        id: 'prod-2',
        name: 'Apple AirPods Pro 2',
        description: '主动降噪，空间音频',
        price: 1899,
        currency: 'CNY',
        category: 'electronics',
        merchant: 'Apple官方',
        rating: 4.9,
        stock: 50,
      },
    ];

    if (category) {
      return products.filter((p) => p.category === category);
    }

    return products;
  }

  /**
   * 获取服务演示数据
   */
  @Get('demo/services')
  @ApiOperation({ summary: '获取服务演示数据（MOCK）' })
  @ApiResponse({ status: 200, description: '返回服务列表' })
  async getDemoServices(@Query('category') category?: string) {
    // MOCK服务数据
    const services = [
      {
        id: 'svc-1',
        name: 'AI Agent 开发咨询服务',
        description: '提供AI Agent架构设计、开发指导',
        price: 500,
        currency: 'CNY',
        category: 'consultation',
        merchant: 'Agentrix技术团队',
        duration: '1小时',
        rating: 4.9,
      },
      {
        id: 'svc-2',
        name: 'Agentrix SDK 企业版订阅',
        description: '包含高级API、优先支持',
        price: 999,
        currency: 'CNY',
        category: 'subscription',
        merchant: 'Agentrix',
        duration: '月度',
        rating: 4.8,
      },
    ];

    if (category) {
      return services.filter((s) => s.category === category);
    }

    return services;
  }
}

