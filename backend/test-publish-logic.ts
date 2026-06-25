
import { AppDataSource } from './src/config/data-source';
import { Skill, SkillStatus } from './src/entities/skill.entity';
import { SkillService } from './src/modules/skill/skill.service';
import { SkillConverterService } from './src/modules/skill/skill-converter.service';
import { ConfigService } from '@nestjs/config';

async function testPublish() {
  await AppDataSource.initialize();
  
  const skillRepo = AppDataSource.getRepository(Skill);
  // @ts-ignore
  const skillService = new SkillService(skillRepo, null, new SkillConverterService(), new ConfigService());

  // 1. Create a draft skill
  const skill = skillRepo.create({
    name: 'test_commerce_skill',
    displayName: 'Test Commerce Skill',
    description: 'A skill for testing UCP/MCP search',
    category: 'commerce' as any,
    status: SkillStatus.DRAFT,
    inputSchema: { type: 'object', properties: {}, required: [] },
    executor: { type: 'internal', internalHandler: 'echo' }
  });
  
  const saved = await skillRepo.save(skill);
  console.log('--- Draft Created ---');
  console.log(`ID: ${saved.id}, UCP Enabled: ${saved.ucpEnabled}`);

  // 2. Publish it
  await skillService.publish(saved.id);
  const published = await skillRepo.findOne({ where: { id: saved.id } });
  
  console.log('--- After Publish ---');
  console.log(`Status: ${published?.status}`);
  console.log(`UCP Enabled: ${published?.ucpEnabled}`);
  console.log(`UCP Endpoint: ${published?.ucpCheckoutEndpoint}`);

  await AppDataSource.destroy();
}

testPublish();
