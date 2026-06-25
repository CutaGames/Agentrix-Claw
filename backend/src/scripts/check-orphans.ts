import { AppDataSource } from '../config/data-source';
import { Skill } from '../entities/skill.entity';

async function checkOrphanSkills() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const skillRepository = AppDataSource.getRepository(Skill);
    
    // 使用原生查询检查
    const result = await skillRepository
      .createQueryBuilder('skill')
      .where('skill.authorId IS NULL')
      .getCount();
    
    console.log(`无主Skills数量: ${result}`);
    
    // 显示前5个无主skill
    const orphans = await skillRepository
      .createQueryBuilder('skill')
      .where('skill.authorId IS NULL')
      .limit(5)
      .getMany();
    
    if (orphans.length > 0) {
      console.log('\n前5个无主Skills:');
      orphans.forEach(s => console.log(`  - ${s.name} (${s.id})`));
    }

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrphanSkills();
