# 安装 jszip 说明

## 问题

如果遇到网络连接问题（ECONNREFUSED），可以尝试以下解决方案：

## 解决方案

### 方案1：切换npm镜像源

```bash
# 切换到官方源
npm config set registry https://registry.npmjs.org/

# 或者使用淘宝镜像
npm config set registry https://registry.npmmirror.com

# 然后安装
npm install jszip @types/jszip --legacy-peer-deps
```

### 方案2：使用yarn

```bash
# 安装yarn（如果未安装）
npm install -g yarn

# 使用yarn安装
yarn add jszip
yarn add -D @types/jszip
```

### 方案3：使用pnpm

```bash
# 安装pnpm（如果未安装）
npm install -g pnpm

# 使用pnpm安装
pnpm add jszip
pnpm add -D @types/jszip
```

### 方案4：手动下载（如果网络问题持续）

1. 访问 https://www.npmjs.com/package/jszip
2. 下载源码
3. 解压到 `node_modules/jszip`
4. 访问 https://www.npmjs.com/package/@types/jszip
5. 下载类型定义
6. 解压到 `node_modules/@types/jszip`

### 方案5：使用CDN（临时方案）

如果无法安装，代码已经实现了fallback机制，会逐个下载文件而不是打包成ZIP。

## 当前实现

代码已经支持：
- ✅ 如果jszip已安装，会生成ZIP包
- ✅ 如果jszip未安装，会逐个下载文件
- ✅ 动态导入，避免webpack打包问题

## 验证安装

安装完成后，Agent导出功能会自动使用ZIP打包。如果未安装，会使用fallback方案（逐个下载文件）。

