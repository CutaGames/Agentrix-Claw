import { DataSource } from 'typeorm';
import { MerchantTask, TaskStatus, TaskType, TaskVisibility } from '../entities/merchant-task.entity';
import { AppDataSource } from '../config/data-source';

async function seed() {
  const dataSource = new DataSource(AppDataSource.options);
  await dataSource.initialize();
  console.log('Data Source initialized for task seeding');

  const taskRepo = dataSource.getRepository(MerchantTask);

  // 获取第一个用户作为任务发布者（如果没有用户则跳过）
  const userRepo = dataSource.getRepository('users');
  const users = await userRepo.find({ take: 3 });
  if (users.length === 0) {
    console.log('No users found. Please create at least one user first.');
    await dataSource.destroy();
    return;
  }

  const seedTasks: Partial<MerchantTask>[] = [
    // 开发类
    {
      userId: users[0]?.id,
      type: TaskType.DEVELOPMENT,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: '开发 Telegram Bot — 自动回复 + 群管理',
      description: '需要一个 Telegram Bot，支持：\n1. 自动回复关键词\n2. 新成员欢迎消息\n3. 违规内容自动删除\n4. 群统计数据面板\n\n技术栈：Node.js + grammY/Telegraf\n需要提供源码和部署文档。',
      budget: 2000,
      currency: 'CNY',
      tags: ['telegram', 'bot', 'nodejs', '自动化'],
      requirements: {
        deadline: new Date(Date.now() + 14 * 86400000),
        deliverables: ['源代码', '部署文档', 'Bot Token 配置说明'],
      },
      metadata: { priority: 'high', skillRequirements: ['Node.js', 'Telegram API'] },
    },
    {
      userId: users[0]?.id,
      type: TaskType.DEVELOPMENT,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: '智能合约审计 — ERC-20 Token + Staking',
      description: '需要对以下合约进行安全审计：\n- ERC-20 Token 合约（含铸造/销毁）\n- Staking 合约（质押挖矿）\n- 时间锁合约\n\n要求输出完整审计报告，包含漏洞等级分类和修复建议。',
      budget: 5000,
      currency: 'CNY',
      tags: ['solidity', '审计', '智能合约', 'defi'],
      requirements: {
        deadline: new Date(Date.now() + 7 * 86400000),
        deliverables: ['审计报告 PDF', '漏洞清单', '修复建议'],
      },
      metadata: { priority: 'high', skillRequirements: ['Solidity', 'Smart Contract Audit'] },
    },
    {
      userId: users[Math.min(1, users.length - 1)]?.id,
      type: TaskType.DEVELOPMENT,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: 'React Native 电商 App — MVP 版本',
      description: '需要开发一个电商 App 的 MVP 版本：\n- 商品列表 + 搜索\n- 商品详情页\n- 购物车\n- 简单支付流程（对接支付宝/微信）\n- 订单列表\n\n使用 Expo + React Native，需要同时支持 iOS 和 Android。',
      budget: 15000,
      currency: 'CNY',
      tags: ['react-native', 'expo', '电商', 'app'],
      requirements: {
        deadline: new Date(Date.now() + 30 * 86400000),
        deliverables: ['源代码', 'APK/IPA', 'API 文档'],
      },
      metadata: { priority: 'medium', skillRequirements: ['React Native', 'Expo', 'TypeScript'] },
    },

    // 设计类
    {
      userId: users[Math.min(1, users.length - 1)]?.id,
      type: TaskType.DESIGN,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: 'Web3 项目品牌设计 — Logo + VI 全套',
      description: '为一个 DeFi 项目设计品牌视觉：\n- Logo 设计（含 3 个方案）\n- 品牌色彩系统\n- 字体规范\n- 社交媒体头像/Banner\n- 名片设计\n\n风格参考：科技感、未来感、简洁。',
      budget: 3000,
      currency: 'CNY',
      tags: ['设计', 'logo', 'VI', 'web3', '品牌'],
      requirements: {
        deadline: new Date(Date.now() + 10 * 86400000),
        deliverables: ['Logo 源文件 (AI/SVG)', 'VI 手册 PDF', '社交媒体素材包'],
      },
      metadata: { priority: 'medium', skillRequirements: ['Figma', 'Illustrator', 'Brand Design'] },
    },
    {
      userId: users[0]?.id,
      type: TaskType.DESIGN,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: 'App UI/UX 设计 — 社交+钱包 App',
      description: '需要设计一个社交+钱包 App 的完整 UI：\n- 登录/注册流程\n- 首页 Feed\n- 钱包页面（余额、转账、收款）\n- 个人中心\n- 聊天界面\n\n需要 Figma 源文件，含交互原型。暗色主题为主。',
      budget: 8000,
      currency: 'CNY',
      tags: ['UI', 'UX', 'figma', 'app设计', '暗色主题'],
      requirements: {
        deadline: new Date(Date.now() + 14 * 86400000),
        deliverables: ['Figma 源文件', '交互原型', '设计规范文档'],
      },
      metadata: { priority: 'high', skillRequirements: ['Figma', 'UI Design', 'Mobile Design'] },
    },

    // 内容类
    {
      userId: users[Math.min(2, users.length - 1)]?.id,
      type: TaskType.CONTENT,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: '撰写 Web3 项目白皮书 — 中英双语',
      description: '为一个 AI+Web3 项目撰写白皮书：\n- 项目概述和愿景\n- 技术架构\n- 代币经济模型\n- 路线图\n- 团队介绍\n\n需要中英文双语版本，各约 20 页。',
      budget: 5000,
      currency: 'CNY',
      tags: ['白皮书', 'web3', 'AI', '中英双语', '内容'],
      requirements: {
        deadline: new Date(Date.now() + 21 * 86400000),
        deliverables: ['中文白皮书 PDF', '英文白皮书 PDF', 'Word 源文件'],
      },
      metadata: { priority: 'medium', skillRequirements: ['Technical Writing', 'Web3', 'Bilingual'] },
    },
    {
      userId: users[0]?.id,
      type: TaskType.CONTENT,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: 'Twitter/X 运营 — 30天内容计划',
      description: '需要制定并执行 Twitter/X 账号运营计划：\n- 30 天内容日历\n- 每日 1-2 条推文（含图片/视频）\n- 互动策略\n- 数据分析报告\n\n领域：AI/Web3/Tech',
      budget: 3000,
      currency: 'CNY',
      tags: ['twitter', '运营', '内容', 'AI', 'web3'],
      requirements: {
        deadline: new Date(Date.now() + 35 * 86400000),
        deliverables: ['内容日历表', '30天推文素材', '运营报告'],
      },
      metadata: { priority: 'low', skillRequirements: ['Social Media', 'Content Creation'] },
    },

    // 咨询类
    {
      userId: users[Math.min(1, users.length - 1)]?.id,
      type: TaskType.CONSULTATION,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: '智能合约架构咨询 — DeFi 协议设计',
      description: '需要资深 Solidity 开发者提供技术咨询：\n- 审查现有合约架构\n- 提供 Gas 优化建议\n- 安全性评估\n- 升级方案设计\n\n预计 3-5 次线上会议，每次 1-2 小时。',
      budget: 2000,
      currency: 'USD',
      tags: ['咨询', 'solidity', 'defi', '架构'],
      requirements: {
        deadline: new Date(Date.now() + 14 * 86400000),
        deliverables: ['咨询报告', '架构建议文档', '会议记录'],
      },
      metadata: { priority: 'high', skillRequirements: ['Solidity', 'DeFi', 'Architecture'] },
    },

    // 其他
    {
      userId: users[0]?.id,
      type: TaskType.OTHER,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: '社区运营 — Discord 服务器搭建 + 管理',
      description: '需要搭建和管理 Discord 社区：\n- 频道结构设计\n- Bot 配置（MEE6/Carl-bot）\n- 角色权限设置\n- 前 2 周日常管理\n- 活动策划（AMA、抽奖）',
      budget: 1500,
      currency: 'CNY',
      tags: ['discord', '社区', '运营', 'web3'],
      requirements: {
        deadline: new Date(Date.now() + 7 * 86400000),
        deliverables: ['Discord 服务器', '运营手册', 'Bot 配置文档'],
      },
      metadata: { priority: 'medium', skillRequirements: ['Discord', 'Community Management'] },
    },
    {
      userId: users[Math.min(2, users.length - 1)]?.id,
      type: TaskType.CUSTOM_SERVICE,
      status: TaskStatus.PENDING,
      visibility: TaskVisibility.PUBLIC,
      title: 'AI Agent 训练 — 客服自动回复',
      description: '需要训练一个 AI 客服 Agent：\n- 基于 GPT-4 微调\n- 支持中英文\n- 集成到网站 Widget\n- 知识库管理后台\n- 人工接管功能\n\n需要提供训练数据格式说明和部署方案。',
      budget: 8000,
      currency: 'CNY',
      tags: ['AI', 'agent', '客服', 'GPT', '自动化'],
      requirements: {
        deadline: new Date(Date.now() + 21 * 86400000),
        deliverables: ['AI Agent 部署', '管理后台', '训练文档', 'API 接口'],
      },
      metadata: { priority: 'high', skillRequirements: ['AI/ML', 'GPT', 'Python', 'NLP'] },
    },
  ];

  for (const taskData of seedTasks) {
    const existing = await taskRepo.findOne({ where: { title: taskData.title } });
    if (existing) {
      console.log(`Task "${taskData.title}" already exists, skipping.`);
    } else {
      console.log(`Creating task: ${taskData.title}`);
      const task = taskRepo.create(taskData);
      await taskRepo.save(task);
    }
  }

  console.log(`\nSeeded ${seedTasks.length} tasks successfully!`);
  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('Task seeding failed:', error);
  process.exit(1);
});
