import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

const execAsync = promisify(exec);

/**
 * 数据库备份脚本
 * 使用 pg_dump 备份 PostgreSQL 数据库
 */

interface BackupOptions {
  outputDir?: string;
  filename?: string;
  compress?: boolean;
}

async function backupDatabase(options: BackupOptions = {}) {
  const {
    outputDir = path.join(process.cwd(), 'backups'),
    filename,
    compress = true,
  } = options;

  // 从环境变量获取数据库配置
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbUsername = process.env.DB_USERNAME || 'agentrix';
  const dbPassword = process.env.DB_PASSWORD || 'agentrix_password';
  const dbName = process.env.DB_DATABASE || 'agentrix';

  // 生成备份文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                    new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
  const backupFilename = filename || `agentrix_backup_${timestamp}.sql`;
  const backupPath = path.join(outputDir, backupFilename);
  const compressedPath = compress ? `${backupPath}.gz` : backupPath;

  console.log('📦 开始备份数据库...\n');
  console.log(`数据库: ${dbName}`);
  console.log(`主机: ${dbHost}:${dbPort}`);
  console.log(`用户: ${dbUsername}`);
  console.log(`备份文件: ${compressedPath}\n`);

  try {
    // 确保备份目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`✅ 创建备份目录: ${outputDir}`);
    }

    // 设置环境变量（pg_dump 会读取 PGPASSWORD）
    const env = {
      ...process.env,
      PGPASSWORD: dbPassword,
    };

    // 构建 pg_dump 命令
    let command: string;
    if (compress) {
      // 使用 gzip 压缩
      command = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUsername} -d ${dbName} -F c -f ${compressedPath}`;
    } else {
      // 不压缩，纯 SQL 格式
      command = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUsername} -d ${dbName} -f ${backupPath}`;
    }

    console.log('🔄 执行备份命令...');
    const { stdout, stderr } = await execAsync(command, { env });

    if (stderr && !stderr.includes('WARNING')) {
      console.error('⚠️  备份警告:', stderr);
    }

    if (stdout) {
      console.log(stdout);
    }

    // 检查备份文件是否存在
    const finalPath = compress ? compressedPath : backupPath;
    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`\n✅ 备份完成！`);
      console.log(`   文件: ${finalPath}`);
      console.log(`   大小: ${fileSizeMB} MB`);
      console.log(`   时间: ${new Date().toLocaleString()}`);
      return finalPath;
    } else {
      throw new Error('备份文件未生成');
    }
  } catch (error: any) {
    console.error('\n❌ 备份失败:', error.message);
    
    // 提供手动备份命令
    console.log('\n💡 如果自动备份失败，可以手动执行以下命令：');
    console.log(`\n   PGPASSWORD=${dbPassword} pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUsername} -d ${dbName} > ${backupPath}`);
    
    throw error;
  }
}

// 主函数
async function main() {
  try {
    const backupPath = await backupDatabase({
      compress: true, // 使用压缩格式
    });
    
    console.log('\n📋 备份信息：');
    console.log(`   备份文件已保存到: ${backupPath}`);
    console.log(`   恢复命令: pg_restore -h <host> -p <port> -U <user> -d <database> ${backupPath}`);
    console.log(`   或使用 SQL 格式: psql -h <host> -p <port> -U <user> -d <database> < ${backupPath.replace('.gz', '')}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 备份过程出错:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

export { backupDatabase };

