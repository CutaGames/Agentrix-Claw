import { Share, Platform, Alert } from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';

export interface ShareContent {
  title?: string;
  message: string;
  url?: string;
}

export interface ShareResult {
  success: boolean;
  action?: 'shared' | 'dismissed' | 'copied';
}

class SocialShareService {
  /**
   * 分享到系统分享面板
   */
  async share(content: ShareContent): Promise<ShareResult> {
    try {
      const shareContent: any = {
        message: content.message,
      };

      if (content.title) {
        shareContent.title = content.title;
      }

      if (content.url) {
        // iOS 需要单独的 url 字段
        if (Platform.OS === 'ios') {
          shareContent.url = content.url;
        } else {
          // Android 把 url 附加到 message
          shareContent.message = `${content.message}\n\n${content.url}`;
        }
      }

      const result = await Share.share(shareContent);

      if (result.action === Share.sharedAction) {
        return { success: true, action: 'shared' };
      } else if (result.action === Share.dismissedAction) {
        return { success: false, action: 'dismissed' };
      }

      return { success: true };
    } catch (error) {
      console.error('Share failed:', error);
      return { success: false };
    }
  }

  /**
   * 复制到剪贴板
   */
  async copyToClipboard(text: string, showAlert: boolean = true): Promise<boolean> {
    try {
      await ExpoClipboard.setStringAsync(text);
      
      if (showAlert) {
        Alert.alert('已复制', '内容已复制到剪贴板');
      }
      return true;
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      if (showAlert) {
        Alert.alert('复制失败', '无法复制到剪贴板');
      }
      return false;
    }
  }

  /**
   * 分享收款链接
   */
  async sharePaymentLink(params: {
    amount: number;
    currency?: string;
    merchantName?: string;
    paymentUrl: string;
  }): Promise<ShareResult> {
    const { amount, currency = 'USDC', merchantName, paymentUrl } = params;
    
    const title = merchantName 
      ? `向 ${merchantName} 付款` 
      : '收款链接';
    
    const message = merchantName
      ? `${merchantName} 请求您支付 ${amount} ${currency}。点击链接完成支付：`
      : `请支付 ${amount} ${currency}：`;

    return this.share({
      title,
      message,
      url: paymentUrl,
    });
  }

  /**
   * 分享 Agent 名片
   */
  async shareAgentCard(params: {
    agentName: string;
    agentDescription?: string;
    agentUrl: string;
  }): Promise<ShareResult> {
    const { agentName, agentDescription, agentUrl } = params;
    
    const message = agentDescription
      ? `🤖 ${agentName}\n\n${agentDescription}\n\n试试这个 Agent：`
      : `🤖 试试这个 Agent: ${agentName}`;

    return this.share({
      title: `分享 Agent: ${agentName}`,
      message,
      url: agentUrl,
    });
  }

  /**
   * 分享空投信息
   */
  async shareAirdrop(params: {
    projectName: string;
    estimatedValue: string;
    claimUrl: string;
  }): Promise<ShareResult> {
    const { projectName, estimatedValue, claimUrl } = params;
    
    return this.share({
      title: `${projectName} 空投`,
      message: `🎁 发现一个空投机会！\n\n项目: ${projectName}\n预估价值: ${estimatedValue}\n\n快来领取：`,
      url: claimUrl,
    });
  }

  /**
   * 分享收益截图/数据
   */
  async shareEarnings(params: {
    totalEarnings: string;
    period?: string;
  }): Promise<ShareResult> {
    const { totalEarnings, period = '本月' } = params;
    
    return this.share({
      title: 'Agentrix 收益',
      message: `📈 我在 Agentrix 上${period}收益 ${totalEarnings}！\n\n加入 Agentrix，让 AI Agent 帮你赚钱：`,
      url: 'https://agentrix.io/download',
    });
  }

  /**
   * 邀请好友
   */
  async shareInvitation(params: {
    inviteCode?: string;
    referralUrl: string;
  }): Promise<ShareResult> {
    const { inviteCode, referralUrl } = params;
    
    let message = '🚀 我在使用 Agentrix - 一个让 AI Agent 帮你管理数字资产的平台！';
    
    if (inviteCode) {
      message += `\n\n使用我的邀请码 ${inviteCode} 注册，我们都能获得奖励！`;
    }
    
    message += '\n\n立即加入：';

    return this.share({
      title: '邀请你加入 Agentrix',
      message,
      url: referralUrl,
    });
  }

  /**
   * 分享交易详情
   */
  async shareTransaction(params: {
    type: 'send' | 'receive';
    amount: string;
    currency: string;
    txHash?: string;
    explorerUrl?: string;
  }): Promise<ShareResult> {
    const { type, amount, currency, txHash, explorerUrl } = params;
    
    const action = type === 'send' ? '发送' : '收到';
    let message = `${action}了 ${amount} ${currency}`;
    
    if (txHash) {
      message += `\n\n交易哈希: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
    }

    return this.share({
      title: `${action} ${currency}`,
      message,
      url: explorerUrl,
    });
  }
}

export const socialShareService = new SocialShareService();
