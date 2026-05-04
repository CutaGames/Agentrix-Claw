# 解决 npm 网络连接问题

## 问题描述

安装 jszip 时遇到网络连接错误：
```
npm error code ECONNREFUSED
npm error syscall connect
npm error errno ECONNREFUSED
npm error FetchError: request to https://registry.npmmirror.com/jszip failed
```

## 解决方案

### 方案1：切换npm镜像源（推荐）

```bash
# 切换到官方源
npm config set registry https://registry.npmjs.org/

# 或者使用淘宝镜像
npm config set registry https://registry.npmmirror.com

# 清除npm缓存
npm cache clean --force

# 重新安装
cd agentrixfrontend
npm install jszip @types/jszip --legacy-peer-deps
```

### 方案2：使用yarn（推荐）

```bash
# 安装yarn（如果未安装）
npm install -g yarn

# 使用yarn安装
cd agentrixfrontend
yarn add jszip
yarn add -D @types/jszip
```

### 方案3：使用pnpm

```bash
# 安装pnpm（如果未安装）
npm install -g pnpm

# 使用pnpm安装
cd agentrixfrontend
pnpm add jszip
pnpm add -D @types/jszip
```

### 方案4：检查代理设置

```bash
# 检查当前代理设置
npm config get proxy
npm config get https-proxy

# 如果有代理，取消设置
npm config delete proxy
npm config delete https-proxy

# 或者设置正确的代理
npm config set proxy http://your-proxy:port
npm config set https-proxy http://your-proxy:port
```

### 方案5：使用.npmrc文件

在 `agentrixfrontend` 目录下创建 `.npmrc` 文件：

```
registry=https://registry.npmjs.org/
# 或者
# registry=https://registry.npmmirror.com
```

### 方案6：临时使用其他网络

如果当前网络有问题，可以：
1. 使用手机热点
2. 使用VPN
3. 换个网络环境

## 当前代码状态

✅ **代码已经支持fallback机制**：
- 如果 jszip 已安装，会生成ZIP包
- 如果 jszip 未安装，会逐个下载文件
- 使用动态导入，避免webpack打包问题

**即使不安装 jszip，Agent导出功能也能正常工作**（只是会逐个下载文件而不是打包成ZIP）。

## 验证安装

安装完成后，可以验证：

```bash
# 检查是否安装成功
cd agentrixfrontend
npm list jszip
npm list @types/jszip
```

如果看到版本号，说明安装成功。

## 如果仍然无法安装

如果所有方案都失败，可以：
1. 手动下载 jszip 源码
2. 或者直接使用当前的fallback方案（逐个下载文件）

**当前实现已经足够使用，jszip是可选的增强功能。**

