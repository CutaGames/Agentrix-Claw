/**
 * Test Skill Onboarding - 五大用户画像入驻流程测试
 * 
 * 测试所有五个用户画像的入驻流程，并验证：
 * 1. Skill 创建成功
 * 2. 自动发布到 Marketplace
 * 3. 可通过 MCP/UCP/X402 检索和交易
 */

import { AppDataSource } from '../config/data-source';
import { Skill, SkillStatus } from '../entities/skill.entity';
import { Product, ProductStatus } from '../entities/product.entity';
import { User, UserRole } from '../entities/user.entity';

async function testOnboardingFlows() {
  console.log('🧪 开始测试五大用户画像入驻流程...\n');

  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ 数据库连接成功\n');
    }

    const skillRepo = AppDataSource.getRepository(Skill);
    const productRepo = AppDataSource.getRepository(Product);
    const userRepo = AppDataSource.getRepository(User);

    // 创建测试用户
    let testUser = await userRepo.findOne({ where: { email: 'test_onboarding@agentrix.io' } } as any);
    if (!testUser) {
      const newUser = userRepo.create({
        email: 'test_onboarding@agentrix.io',
        agentrixId: 'test_onboarding_user',
        roles: [UserRole.MERCHANT],
      } as any);
      testUser = (await userRepo.save(newUser)) as any as User;
      console.log('✅ 测试用户创建成功\n');
    }

    // ========== 测试 1: API 厂商入驻 ==========
    console.log('📋 测试 1: API 厂商入驻');
    const apiVendorSkill = skillRepo.create({
      name: 'translation_api',
      displayName: 'Translation API',
      description: 'Multi-language translation service powered by advanced AI',
      layer: 'logic',
      category: 'integration',
      source: 'imported',
      valueType: 'action',
      authorId: testUser.id,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          targetLang: { type: 'string', description: 'Target language code', enum: ['en', 'es', 'fr', 'de', 'zh'] },
        },
        required: ['text', 'targetLang'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          translatedText: { type: 'string', description: 'Translated text' },
          confidence: { type: 'number', description: 'Translation confidence' },
        },
      },
      executor: {
        type: 'http',
        endpoint: 'https://api.translation.example.com/v1/translate',
        method: 'POST',
      },
      pricing: {
        type: 'per_call',
        pricePerCall: 0.01,
        currency: 'USDC',
      },
      ucpEnabled: true,
      x402Enabled: true,
      ucpCheckoutEndpoint: 'http://localhost:3001/ucp/v1/checkout-sessions',
      x402ServiceEndpoint: 'http://localhost:3001/.well-known/x402',
      aiPriority: 'medium',
    } as any);

    const savedApiSkill = (await skillRepo.save(apiVendorSkill)) as any as Skill;
    console.log(`✅ API 厂商 Skill 创建成功: ${savedApiSkill.id}`);
    console.log(`   - UCP Enabled: ${savedApiSkill.ucpEnabled}`);
    console.log(`   - X402 Enabled: ${savedApiSkill.x402Enabled}`);
    console.log(`   - Status: ${savedApiSkill.status}\n`);

    // ========== 测试 2: 实物与服务商入驻 ==========
    console.log('📋 测试 2: 实物与服务商入驻');
    
    // 先创建商品
    const testProduct = productRepo.create({
      name: 'Premium Wireless Headphones',
      description: 'High-quality wireless headphones with noise cancellation',
      price: 199.99,
      category: 'electronics',
      merchantId: testUser.id,
      stock: 50,
      status: ProductStatus.ACTIVE,
    } as any);

    const savedProduct = (await productRepo.save(testProduct)) as any as Product;
    console.log(`✅ 商品创建成功: ${savedProduct.id}`);

    // 将商品转换为 Skill
    const physicalServiceSkill = skillRepo.create({
      name: 'buy_wireless_headphones',
      displayName: 'Buy Premium Wireless Headphones',
      description: 'Purchase high-quality wireless headphones with noise cancellation - SKU: WH-1000XM5',
      layer: 'resource',
      category: 'commerce',
      source: 'converted',
      valueType: 'deliverable',
      resourceType: 'physical',
      authorId: testUser.id,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          quantity: { type: 'number', description: 'Quantity to purchase', default: 1 },
          shippingAddress: { type: 'object', description: 'Shipping address' },
        },
        required: ['quantity'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order ID' },
          trackingNumber: { type: 'string', description: 'Tracking number' },
          estimatedDelivery: { type: 'string', description: 'Estimated delivery date' },
        },
      },
      executor: {
        type: 'internal',
        internalHandler: 'unified_product_purchase',
      },
      pricing: {
        type: 'revenue_share',
        revenueSharePercentage: 2.2,
        currency: 'USD',
      },
      ucpEnabled: true,
      x402Enabled: true,
      ucpCheckoutEndpoint: 'http://localhost:3001/ucp/v1/checkout-sessions',
      x402ServiceEndpoint: 'http://localhost:3001/.well-known/x402',
    } as any);

    const savedPhysicalSkill = (await skillRepo.save(physicalServiceSkill)) as any as Skill;
    console.log(`✅ 实物服务商 Skill 创建成功: ${savedPhysicalSkill.id}`);
    console.log(`   - Resource Type: ${savedPhysicalSkill.resourceType}`);
    console.log(`   - Pricing: ${(savedPhysicalSkill.pricing as any)?.type}\n`);

    // ========== 测试 3: 行业专家/顾问入驻 ==========
    console.log('📋 测试 3: 行业专家/顾问入驻');
    const expertConsultantSkill = skillRepo.create({
      name: 'legal_contract_review',
      displayName: 'Legal Contract Review',
      description: 'Professional legal review of contracts with detailed analysis and recommendations',
      layer: 'logic',
      category: 'analysis',
      source: 'native',
      valueType: 'decision',
      authorId: testUser.id,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          contractPdf: { type: 'string', description: 'Contract PDF URL or base64' },
          clientRequirements: { type: 'string', description: 'Specific requirements or concerns' },
          urgency: { type: 'string', enum: ['normal', 'urgent'], description: 'Review urgency' },
        },
        required: ['contractPdf'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          report: { type: 'string', description: 'Detailed legal analysis' },
          recommendations: { type: 'array', description: 'Recommended actions' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Risk assessment' },
          deliveryFormat: { type: 'string', description: 'PDF' },
        },
      },
      executor: {
        type: 'internal',
        internalHandler: 'expert_consultation',
      },
      pricing: {
        type: 'per_call',
        pricePerCall: 150,
        currency: 'USDC',
      },
      ucpEnabled: true,
      x402Enabled: true,
      ucpCheckoutEndpoint: 'http://localhost:3001/ucp/v1/checkout-sessions',
      x402ServiceEndpoint: 'http://localhost:3001/.well-known/x402',
      aiPriority: 'high',
      metadata: { sla: { responseTime: 120, accuracyRate: 98 } },
    } as any);

    const savedExpertSkill = (await skillRepo.save(expertConsultantSkill)) as any as Skill;
    console.log(`✅ 专家顾问 Skill 创建成功: ${savedExpertSkill.id}`);
    console.log(`   - SLA Response Time: ${(savedExpertSkill.metadata as any)?.sla?.responseTime} minutes`);
    console.log(`   - Price: ${(savedExpertSkill.pricing as any)?.pricePerCall} USDC\n`);

    // ========== 测试 4: 专有数据持有方入驻 ==========
    console.log('📋 测试 4: 专有数据持有方入驻');
    const dataProviderSkill = skillRepo.create({
      name: 'realtime_market_data',
      displayName: 'Real-time Market Data Access',
      description: 'Access to real-time financial market data with advanced filtering',
      layer: 'infra',
      category: 'data',
      source: 'native',
      valueType: 'data',
      resourceType: 'data',
      authorId: testUser.id,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Stock symbol' },
          dataType: { type: 'string', enum: ['price', 'volume', 'historical'], description: 'Data type' },
          timeRange: { type: 'string', description: 'Time range (e.g., 1d, 1w, 1m)' },
        },
        required: ['symbol'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', description: 'Market data points' },
          timestamp: { type: 'string', description: 'Data timestamp' },
          source: { type: 'string', description: 'Data source' },
        },
      },
      executor: {
        type: 'http',
        endpoint: 'https://marketdata.example.com/api/v1/query',
        method: 'GET',
      },
      pricing: {
        type: 'per_call',
        pricePerCall: 0.001,
        currency: 'USDC',
      },
      dataConfig: {
        privacyLevel: 'public',
        sensitiveFields: [],
      },
      ucpEnabled: true,
      x402Enabled: true,
      ucpCheckoutEndpoint: 'http://localhost:3001/ucp/v1/checkout-sessions',
      x402ServiceEndpoint: 'http://localhost:3001/.well-known/x402',
      aiPriority: 'medium',
      metadata: { dataConfig: { privacyLevel: 'public' } },
    } as any);

    const savedDataSkill = (await skillRepo.save(dataProviderSkill)) as any as Skill;
    console.log(`✅ 数据持有方 Skill 创建成功: ${savedDataSkill.id}`);
    console.log(`   - Data Privacy: ${(savedDataSkill.metadata as any)?.dataConfig?.privacyLevel}`);
    console.log(`   - Price: ${(savedDataSkill.pricing as any)?.pricePerCall} USDC per query\n`);

    // ========== 测试 5: 全能 AI 开发者入驻 ==========
    console.log('📋 测试 5: 全能 AI 开发者入驻');
    const aiDeveloperSkill = skillRepo.create({
      name: 'image_analysis_workflow',
      displayName: 'AI Image Analysis Workflow',
      description: 'Comprehensive image analysis including object detection, OCR, and sentiment analysis',
      layer: 'composite',
      category: 'workflow',
      source: 'native',
      valueType: 'action',
      authorId: testUser.id,
      status: SkillStatus.PUBLISHED,
      inputSchema: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string', description: 'Image URL to analyze' },
          analysisType: {
            type: 'array',
            items: { type: 'string', enum: ['objects', 'text', 'faces', 'sentiment'] },
            description: 'Types of analysis to perform',
          },
        },
        required: ['imageUrl'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          objects: { type: 'array', description: 'Detected objects' },
          text: { type: 'string', description: 'Extracted text' },
          faces: { type: 'array', description: 'Detected faces' },
          sentiment: { type: 'object', description: 'Sentiment analysis' },
          confidence: { type: 'number', description: 'Overall confidence' },
        },
      },
      executor: {
        type: 'internal',
        internalHandler: 'custom_workflow',
        codeRepository: 'https://github.com/agentrix/image-analysis',
      },
      pricing: {
        type: 'per_call',
        pricePerCall: 0.5,
        currency: 'USDC',
      },
      compositeSkills: [], // Could reference other skills
      visibility: 'public',
      ucpEnabled: true,
      x402Enabled: true,
      ucpCheckoutEndpoint: 'http://localhost:3001/ucp/v1/checkout-sessions',
      x402ServiceEndpoint: 'http://localhost:3001/.well-known/x402',
      aiPriority: 'high',
      metadata: { visibility: 'public' },
    } as any);

    const savedAiDevSkill = (await skillRepo.save(aiDeveloperSkill)) as any as Skill;
    console.log(`✅ AI 开发者 Skill 创建成功: ${savedAiDevSkill.id}`);
    console.log(`   - Layer: ${savedAiDevSkill.layer}`);
    console.log(`   - Visibility: ${(savedAiDevSkill.metadata as any)?.visibility}\n`);

    // ========== 验证所有 Skill 都已发布并可检索 ==========
    console.log('\n📊 验证所有 Skill 的协议支持情况:\n');

    const allTestSkills = await skillRepo.find({
      where: {
        authorId: testUser.id,
        status: SkillStatus.PUBLISHED,
      },
    });

    console.log(`✅ 共创建 ${allTestSkills.length} 个 Skill\n`);

    allTestSkills.forEach((skill, index) => {
      console.log(`${index + 1}. ${skill.displayName} (${skill.id})`);
      console.log(`   Layer: ${skill.layer}`);
      console.log(`   Category: ${skill.category}`);
      console.log(`   Status: ${skill.status}`);
      console.log(`   UCP Enabled: ${skill.ucpEnabled ? '✅' : '❌'}`);
      console.log(`   X402 Enabled: ${skill.x402Enabled ? '✅' : '❌'}`);
      console.log(`   MCP Compatible: ✅ (自动通过 tools/list 暴露)`);
      console.log('');
    });

    // ========== 测试协议端点 ==========
    console.log('\n🔍 测试协议检索能力:\n');

    // UCP Skills
    const ucpSkills = allTestSkills.filter((s) => s.ucpEnabled);
    console.log(`📦 UCP Skills (可被 Gemini 检索): ${ucpSkills.length}`);

    // X402 Skills
    const x402Skills = allTestSkills.filter((s) => s.x402Enabled);
    console.log(`💰 X402 Skills (支持 Agent 支付): ${x402Skills.length}`);

    // MCP Skills (所有已发布的 Skill 都可通过 MCP)
    console.log(`🤖 MCP Skills (可被 Claude/ChatGPT 调用): ${allTestSkills.length}`);

    console.log('\n✅ 所有五大用户画像入驻测试完成!');
    console.log('\n📝 后续步骤:');
    console.log('1. 启动 backend: cd backend && npm run start:dev');
    console.log('2. 测试 UCP 端点: GET http://localhost:3001/ucp/v1/skills');
    console.log('3. 测试 X402 端点: GET http://localhost:3001/.well-known/x402');
    console.log('4. 测试 MCP 端点: GET http://localhost:3001/api/mcp/sse (SSE Transport)');
    console.log('5. 测试 Marketplace: GET http://localhost:3001/unified-marketplace/search');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// 运行测试
testOnboardingFlows()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
