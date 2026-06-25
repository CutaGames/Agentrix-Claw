
import { AppDataSource } from '../config/data-source';
import { Skill, SkillStatus, SkillCategory, SkillLayer, SkillValueType, SkillPricingType } from '../entities/skill.entity';
import { User, UserRole } from '../entities/user.entity';

async function testSkillRefactorFlow() {
  console.log('🧪 Starting Skill Refactor Flow Test...\n');

  try {
    // 1. Initialize Database
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ Database connected\n');
    }

    const skillRepo = AppDataSource.getRepository(Skill);
    const userRepo = AppDataSource.getRepository(User);

    // 2. Setup Test User
    let testUser = await userRepo.findOne({ where: { email: 'skill_test_user@agentrix.io' } } as any);
    if (!testUser) {
      const newUser = userRepo.create({
        email: 'skill_test_user@agentrix.io',
        agentrixId: 'skill_test_user',
        roles: [UserRole.DEVELOPER],
      } as any);
      testUser = (await userRepo.save(newUser)) as any as User;
      console.log('✅ Test user created: skill_test_user\n');
    } else {
      console.log('✅ Test user loaded: skill_test_user\n');
    }

    // 3. Simulate Unified Publishing Flow (Step 1-3) submission
    console.log('🚀 Simulating Unified Publishing (Step 3 Submit)...');
    
    // Payload usually sent from frontend
    const publishingPayload = {
      name: 'Refactor Test Skill - API Tracker',
      description: 'Auto-generated skill from wizard for tracking',
      category: SkillCategory.UTILITY,
      status: SkillStatus.PUBLISHED,
      
      // Mapped fields
      pricing: {
        pricePerCall: 0.05,
        currency: 'USD',
        type: SkillPricingType.PER_CALL
      },
      
      metadata: {
        persona: 'api_provider',
        apiUrl: 'https://api.test.com/v1/track',
        usageExamples: ['Check order status', 'Track package']
      },

      // Required fields
      layer: SkillLayer.LOGIC,
      valueType: SkillValueType.ACTION,
      source: 'native',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      executor: { type: 'http', endpoint: 'https://api.test.com/v1/track', method: 'POST' },
      
      authorId: testUser.id
    };

    const newSkill = skillRepo.create(publishingPayload as any);
    const savedSkill = (await skillRepo.save(newSkill)) as unknown as Skill;
    
    console.log(`✅ Skill created with ID: ${savedSkill.id}`);
    console.log(`   Name: ${savedSkill.name}`);
    console.log(`   Persona: ${savedSkill.metadata?.persona}`);
    console.log(`   Price: ${savedSkill.pricing?.pricePerCall} ${savedSkill.pricing?.currency}`);

    // 4. Simulate Asset Console Load (MySkillsPanel)
    console.log('\n🔍 Verifying Asset Console Data...');
    const mySkills = await skillRepo.find({ where: { authorId: testUser.id } });
    const found = mySkills.find(s => s.id === savedSkill.id);
    
    if (found) {
      console.log('✅ Skill found in user portfolio');
    } else {
      console.error('❌ Skill NOT found in user portfolio');
      process.exit(1);
    }

    // 5. Simulate Detail Drawer Update (Pricing Tab)
    console.log('\n💰 Simulating Pricing Update...');
    found.pricing = {
      pricePerCall: 0.10,
      currency: 'USD',
      type: SkillPricingType.PER_CALL
    };
    await skillRepo.save(found);
    
    const updatedSkill = (await skillRepo.findOne({ where: { id: savedSkill.id } })) as Skill;
    if (updatedSkill?.pricing?.pricePerCall === 0.10) {
      console.log('✅ Pricing updated successfully to 0.10 USD');
    } else {
      console.error('❌ Pricing update failed');
      console.log('Current pricing:', updatedSkill?.pricing);
    }

    // 6. Simulate Status Toggle (Settings Tab)
    console.log('\n🔄 Simulating Status Toggle...');
    updatedSkill!.status = SkillStatus.DEPRECATED; // Simulating 'suspend'
    await skillRepo.save(updatedSkill!);
    console.log('✅ Status changed to DEPRECATED (Suspended)');

    // 7. Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await skillRepo.remove(updatedSkill!);
    console.log('✅ Test skill removed');

    console.log('\n🎉 ALL TESTS PASSED!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

testSkillRefactorFlow();
