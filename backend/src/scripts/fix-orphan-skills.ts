/**
 * 修复历史无主Skills
 * 
 * 问题：早期创建的skills没有authorId，导致无法在"我的技能"中查询
 * 解决：将无主skills分配给第一个管理员用户或创建默认系统用户
 */

import { AppDataSource } from '../config/data-source';
import { Skill } from '../entities/skill.entity';
import { User, UserRole } from '../entities/user.entity';

async function fixOrphanSkills() {
  console.log('🔧 开始修复无主Skills...\n');

  try {
    // 初始化数据库连接
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✅ 数据库连接成功\n');
    }

    const skillRepository = AppDataSource.getRepository(Skill);
    const userRepository = AppDataSource.getRepository(User);

    // 1. 统计无主skills
    const orphanSkills = await skillRepository.find({
      where: { authorId: null as any }
    });

    console.log(`📊 发现 ${orphanSkills.length} 个无主Skills\n`);

    if (orphanSkills.length === 0) {
      console.log('✅ 没有需要修复的Skills，任务完成！');
      return;
    }

    // 2. 查找或创建默认系统用户
    let systemUser = await userRepository.findOne({
      where: { email: 'system@agentrix.top' }
    });

    if (!systemUser) {
      console.log('📝 创建默认系统用户...');
      systemUser = userRepository.create({
        email: 'system@agentrix.top',
        agentrixId: 'system-user-001',
        nickname: 'Agentrix System',
        roles: [UserRole.DEVELOPER]
      });
      await userRepository.save(systemUser);
      console.log(`✅ 系统用户创建成功 (ID: ${systemUser.id})\n`);
    } else {
      console.log(`✅ 使用已存在的系统用户 (ID: ${systemUser.id})\n`);
    }

    // 3. 批量更新无主skills
    console.log('🔄 开始批量更新...');
    
    for (const skill of orphanSkills) {
      skill.authorId = systemUser.id;
      console.log(`   → ${skill.name} (${skill.id})`);
    }

    await skillRepository.save(orphanSkills);
    console.log(`\n✅ 成功更新 ${orphanSkills.length} 个Skills\n`);

    // 4. 验证修复结果
    const remainingOrphans = await skillRepository.count({
      where: { authorId: null as any }
    });

    if (remainingOrphans === 0) {
      console.log('✅ 所有无主Skills已修复！');
    } else {
      console.log(`⚠️  仍有 ${remainingOrphans} 个无主Skills，请检查`);
    }

    // 5. 显示统计信息
    const totalSkills = await skillRepository.count();
    const systemOwnedSkills = await skillRepository.count({
      where: { authorId: systemUser.id }
    });

    console.log('\n📊 修复后统计:');
    console.log(`   总Skills数: ${totalSkills}`);
    console.log(`   系统拥有: ${systemOwnedSkills}`);
    console.log(`   其他用户: ${totalSkills - systemOwnedSkills}`);

  } catch (error) {
    console.error('❌ 修复失败:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// 运行脚本
fixOrphanSkills()
  .then(() => {
    console.log('\n🎉 修复脚本执行完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  });
