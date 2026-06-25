import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

@Injectable()
export class DeveloperService {
  private readonly logger = new Logger(DeveloperService.name);
  private readonly rootPath = process.cwd();

  /**
   * 安全路径检查：确保操作不超出项目根目录
   */
  private validatePath(filePath: string) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.rootPath, filePath);
    const relative = path.relative(this.rootPath, absolutePath);
    
    if (relative.startsWith('..')) {
      throw new ForbiddenException('Access denied: Path is outside of project workspace');
    }
    
    return absolutePath;
  }

  /**
   * 读取源代码文件内容
   */
  async readFile(filePath: string): Promise<string> {
    const safePath = this.validatePath(filePath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    this.logger.log(`Agent reading file: ${filePath}`);
    return fs.readFileSync(safePath, 'utf8');
  }

  /**
   * 写入/修改文件内容
   */
  async writeFile(filePath: string, content: string): Promise<{ success: boolean; path: string }> {
    const safePath = this.validatePath(filePath);
    const dir = path.dirname(safePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.logger.log(`Agent writing to file: ${filePath}`);
    fs.writeFileSync(safePath, content, 'utf8');
    
    return { success: true, path: filePath };
  }

  /**
   * 扫描目录结构
   */
  async listFiles(dirPath: string = '.'): Promise<string[]> {
    const safePath = this.validatePath(dirPath);
    
    this.logger.log(`Agent listing files in: ${dirPath}`);
    const entries = fs.readdirSync(safePath, { withFileTypes: true });
    
    return entries.map(entry => {
      const name = entry.name;
      return entry.isDirectory() ? `${name}/` : name;
    });
  }

  /**
   * 在终端执行命令
   */
  async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    this.logger.log(`Agent executing command: ${command}`);
    
    // 黑名单检查，防止危险操作
    const forbiddenCommands = ['rm -rf /', 'mkfs', 'dd', 'chmod -R 000'];
    if (forbiddenCommands.some(c => command.includes(c))) {
      throw new ForbiddenException('Dangerous command blocked');
    }

    try {
      const { stdout, stderr } = await execPromise(command, { cwd: this.rootPath });
      return { stdout, stderr };
    } catch (error: any) {
      this.logger.error(`Command execution failed: ${error.message}`);
      return { stdout: error.stdout || '', stderr: error.stderr || error.message };
    }
  }

  /**
   * 批量查询代码分析 (基于 RAG)
   */
  async getCodeContext(query: string): Promise<string> {
    // 这里可以结合 RAG 逻辑，目前的简单版本返回基本信息
    return `Analysis context for "${query}" within Agentrix framework (v7.0+).`;
  }

  /**
   * 获取项目文件树（递归，类似 VSCode 文件浏览器）
   */
  async getProjectTree(dirPath: string = '.', maxDepth: number = 3, currentDepth: number = 0): Promise<any> {
    if (currentDepth >= maxDepth) return null;
    
    const safePath = this.validatePath(dirPath);
    const entries = fs.readdirSync(safePath, { withFileTypes: true });
    
    // 过滤掉 node_modules, .git, dist 等常见的大型目录
    const ignored = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
    
    const tree: any[] = [];
    for (const entry of entries) {
      if (ignored.includes(entry.name)) continue;
      
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(this.rootPath, path.join(safePath, entry.name));
      
      if (entry.isDirectory()) {
        const children = await this.getProjectTree(fullPath, maxDepth, currentDepth + 1);
        tree.push({
          name: entry.name,
          type: 'directory',
          path: relativePath,
          children: children || []
        });
      } else {
        tree.push({
          name: entry.name,
          type: 'file',
          path: relativePath
        });
      }
    }
    
    return tree;
  }

  /**
   * 搜索代码（grep 样式）
   */
  async searchCode(query: string, filePattern: string = '*.ts'): Promise<any[]> {
    try {
      // 使用 grep 命令搜索（Linux/Mac）
      const cmd = `grep -rn "${query}" --include="${filePattern}" . 2>/dev/null | head -20`;
      const { stdout } = await execPromise(cmd, { cwd: this.rootPath });
      
      const results = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [filePath, ...rest] = line.split(':');
          const lineNum = rest[0];
          const content = rest.slice(1).join(':');
          return { file: filePath, line: parseInt(lineNum), content };
        });
      
      return results;
    } catch (error: any) {
      this.logger.warn(`Code search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取 Git 状态
   */
  async getGitStatus(): Promise<any> {
    try {
      const { stdout: statusOut } = await execPromise('git status --short', { cwd: this.rootPath });
      const { stdout: branchOut } = await execPromise('git branch --show-current', { cwd: this.rootPath });
      
      return {
        branch: branchOut.trim(),
        changes: statusOut.split('\n').filter(l => l.trim()).map(line => {
          const status = line.substring(0, 2);
          const file = line.substring(3);
          return { status, file };
        })
      };
    } catch (error: any) {
      return { branch: 'unknown', changes: [], error: 'Not a git repository' };
    }
  }

  /**
   * 获取项目概览信息
   */
  async getProjectInfo(): Promise<any> {
    const packageJsonPath = path.join(this.rootPath, 'package.json');
    let projectInfo: any = { name: 'Unknown', version: 'Unknown' };
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      projectInfo = {
        name: packageJson.name,
        version: packageJson.version,
        dependencies: Object.keys(packageJson.dependencies || {}),
        devDependencies: Object.keys(packageJson.devDependencies || {})
      };
    }
    
    return {
      ...projectInfo,
      rootPath: this.rootPath,
      git: await this.getGitStatus()
    };
  }
}
