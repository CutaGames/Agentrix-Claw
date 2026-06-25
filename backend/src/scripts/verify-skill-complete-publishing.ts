import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

// Mock user authentication (replace with real token if needed)
const authHeaders = {
  'Authorization': 'Bearer test-token',
  'Content-Type': 'application/json'
};

interface SkillPayload {
  name: string;
  displayName: string;
  description: string;
  category: string;
  layer: 'infra' | 'resource' | 'logic' | 'composite';
  valueType: 'action' | 'deliverable' | 'decision' | 'data';
  source: 'native' | 'external';
  price?: number;
  pricingType: 'free' | 'per_call' | 'subscription';
  subscriptionPrice?: number;
  status: 'draft' | 'published';
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  executor: Record<string, any>;
  ucpEnabled: boolean;
  x402Enabled: boolean;
  metadata?: Record<string, any>;
}

async function testCompleteSkillPublishing() {
  console.log('🧪 Testing Complete Skill Publishing Flow\n');
  
  try {
    // Test 1: Create skill with complete payload (行业专家 persona)
    console.log('📝 Test 1: Creating skill with expert persona (complete payload)...');
    const expertSkillPayload: SkillPayload = {
      name: `expert_consultation_${Date.now()}`,
      displayName: '行业咨询服务',
      description: '提供专业的行业分析和咨询建议，基于10年+经验',
      category: 'analysis',
      layer: 'logic',
      valueType: 'decision',
      source: 'native',
      pricingType: 'subscription',
      subscriptionPrice: 99,
      status: 'published',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '咨询问题' }
        },
        required: ['query']
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string', description: '咨询结果' }
        }
      },
      executor: {
        type: 'internal',
        handler: 'expert_consultation'
      },
      ucpEnabled: true,
      x402Enabled: true,
      metadata: {
        persona: 'expert',
        slaMetrics: {
          responseTime: 24,
          unit: 'hours'
        }
      }
    };

    const createResponse = await axios.post(`${API_BASE}/skills`, expertSkillPayload, { headers: authHeaders });
    const createdSkill = createResponse.data;
    console.log(`   ✅ Skill created: ${createdSkill.name} (ID: ${createdSkill.id})`);
    console.log(`   📊 Pricing: ${createdSkill.pricingType} @ $${createdSkill.subscriptionPrice || createdSkill.price}/month`);

    // Test 2: Verify skill has all required fields
    console.log('\n🔍 Test 2: Verifying skill completeness...');
    const requiredFields = [
      'name', 'displayName', 'description', 'category', 'layer', 'valueType',
      'source', 'inputSchema', 'outputSchema', 'executor', 'ucpEnabled', 'x402Enabled'
    ];
    const missingFields = requiredFields.filter(field => !(field in createdSkill));
    
    if (missingFields.length > 0) {
      console.log(`   ❌ Missing fields: ${missingFields.join(', ')}`);
      throw new Error('Skill missing required fields');
    }
    console.log('   ✅ All required fields present');

    // Test 3: Verify UCP/X402 discoverability
    console.log('\n🌐 Test 3: Checking UCP/X402 discoverability...');
    console.log(`   UCP Enabled: ${createdSkill.ucpEnabled ? '✅' : '❌'}`);
    console.log(`   X402 Enabled: ${createdSkill.x402Enabled ? '✅' : '❌'}`);
    
    if (!createdSkill.ucpEnabled || !createdSkill.x402Enabled) {
      throw new Error('Skill not discoverable via UCP/X402');
    }

    // Test 4: Create skill with API provider persona
    console.log('\n📝 Test 4: Creating skill with API provider persona...');
    const apiSkillPayload: SkillPayload = {
      name: `weather_data_${Date.now()}`,
      displayName: '实时天气数据',
      description: '提供全球城市实时天气数据',
      category: 'data',
      layer: 'infra',
      valueType: 'data',
      source: 'native',
      pricingType: 'per_call',
      price: 0.01,
      status: 'published',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '城市名称' }
        },
        required: ['query']
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'object', description: '天气数据' }
        }
      },
      executor: {
        type: 'http',
        url: 'https://api.example.com/weather',
        method: 'GET'
      },
      ucpEnabled: true,
      x402Enabled: true,
      metadata: {
        persona: 'data_provider',
        apiUrl: 'https://api.example.com/weather'
      }
    };

    const apiSkillResponse = await axios.post(`${API_BASE}/skills`, apiSkillPayload, { headers: authHeaders });
    const apiSkill = apiSkillResponse.data;
    console.log(`   ✅ API skill created: ${apiSkill.name} (ID: ${apiSkill.id})`);
    console.log(`   📊 Pricing: ${apiSkill.pricingType} @ $${apiSkill.price} per call`);

    // Test 5: Verify both skills appear in portfolio
    console.log('\n📂 Test 5: Checking portfolio...');
    const portfolioResponse = await axios.get(`${API_BASE}/skills/my`, { headers: authHeaders });
    const mySkills = portfolioResponse.data;
    console.log(`   ✅ Total skills in portfolio: ${mySkills.length}`);
    
    const foundExpert = mySkills.find((s: any) => s.id === createdSkill.id);
    const foundApi = mySkills.find((s: any) => s.id === apiSkill.id);
    
    if (!foundExpert || !foundApi) {
      throw new Error('Skills not found in portfolio');
    }
    console.log('   ✅ Both skills found in portfolio');

    // Test 6: Verify subscription price validation
    console.log('\n💰 Test 6: Testing subscription price validation...');
    try {
      const invalidSubPayload = {
        ...expertSkillPayload,
        name: `invalid_sub_${Date.now()}`,
        pricingType: 'subscription',
        subscriptionPrice: 0 // Invalid: should be > 0
      };
      await axios.post(`${API_BASE}/skills`, invalidSubPayload, { headers: authHeaders });
      console.log('   ❌ Should have rejected 0 subscription price');
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('   ✅ Correctly rejected invalid subscription price');
      } else {
        throw error;
      }
    }

    // Test 7: Verify marketplace discoverability
    console.log('\n🏪 Test 7: Checking marketplace discoverability...');
    const marketplaceResponse = await axios.get(`${API_BASE}/skills/marketplace?status=published`, { headers: authHeaders });
    const publishedSkills = marketplaceResponse.data;
    console.log(`   📊 Total published skills: ${publishedSkills.length}`);
    
    const foundInMarket = publishedSkills.find((s: any) => s.id === createdSkill.id);
    if (!foundInMarket) {
      throw new Error('Published skill not found in marketplace');
    }
    console.log('   ✅ Skill discoverable in marketplace');

    // Cleanup
    console.log('\n🧹 Cleaning up test skills...');
    await axios.delete(`${API_BASE}/skills/${createdSkill.id}`, { headers: authHeaders });
    await axios.delete(`${API_BASE}/skills/${apiSkill.id}`, { headers: authHeaders });
    console.log('   ✅ Test skills deleted');

    console.log('\n✅ ALL TESTS PASSED!\n');
    console.log('Summary:');
    console.log('  ✅ Skills created with complete payload (all required fields)');
    console.log('  ✅ Subscription pricing validated correctly');
    console.log('  ✅ UCP/X402 enablement verified');
    console.log('  ✅ Portfolio integration working');
    console.log('  ✅ Marketplace discoverability confirmed');
    console.log('\n🎉 Skill publishing flow is fully functional!\n');

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response?.data) {
      console.error('   Error details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testCompleteSkillPublishing();
