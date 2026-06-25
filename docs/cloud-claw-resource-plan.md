# Agentrix Cloud Claw 资源规划方案

## 一、当前架构现状

### 用户一键开通的"云虾"(Cloud Claw) 是什么？

每个用户部署的云Claw是一个**独立Docker容器**，运行在Agentrix的AWS EC2主机上：

| 组件 | 说明 |
|------|------|
| 容器镜像 | `openclaw/openclaw:latest` (Node.js应用) |
| 端口 | 内部3001，Docker随机映射主机端口 |
| LLM | 平台注入API Key（DeepSeek/OpenAI/Claude/Gemini/Bedrock） |
| 认证 | 自动生成Bearer Token |
| 状态 | 容器内SQLite/本地文件，不持久化 |
| 重启策略 | `--restart=unless-stopped` |

### 当前问题

1. **无容器资源限制** — `docker run` 没有 `--memory`/`--cpus` 参数
2. **单主机部署** — 所有用户容器都在 `18.139.157.116` 一台EC2上
3. **无编排系统** — 没有K8s/Swarm/ECS
4. **无自动扩容** — 容器数量只能靠手动管理
5. **LLM成本不可控** — 平台为每个用户注入自己的API Key

---

## 二、用户得到的资源

### 每个Cloud Claw实例包含：

| 能力 | 说明 |
|------|------|
| **AI对话** | 接入LLM（DeepSeek/Claude/GPT等），支持多轮对话 |
| **Skill安装** | 可从ClawHub安装4600+技能（搜索、开发工具、数据分析等） |
| **会话记忆** | 对话历史持久化 |
| **Telegram集成** | 通过 @ClawLinkBot 绑定，可在Telegram直接对话 |
| **API接口** | 完整REST API（/api/chat, /api/skills, /api/sessions等） |
| **平台工具** | 调用Agentrix平台能力（支付、商品、佣金等） |

### Token配额（月）：

| 套餐 | 月Token量 | 云实例数 | 存储 | 价格 |
|------|-----------|---------|------|------|
| 免费体验 | 500万 | 1 | 10GB | 免费 |
| Starter | 1000万 | 3 | 40GB | $4.9/月 |
| Pro | 3000万 | 10 | 100GB | $12/月 |

---

## 三、500 / 2000 / 5000 用户规模方案

### 参考竞品方案

| 竞品 | 模式 | 特点 |
|------|------|------|
| **KimiClaw** (月之暗面) | 共享集群 + 用户命名空间隔离 | K8s Pod, 按调用计费, 弹性伸缩 |
| **MaxClaw** | 多租户SaaS | 共享后端, 用户Session隔离, 无独立容器 |
| **CoPaw** (阿里) | Serverless函数 + 对象存储 | 按调用付费, 冷启动优化, 无常驻进程 |

### 方案对比

| 维度 | A. 独立容器(当前) | B. 共享多租户 | C. K8s编排 | D. Serverless |
|------|---------|---------|---------|---------|
| 隔离性 | ★★★★ 强 | ★★ 中 | ★★★★ 强 | ★★★ 中 |
| 资源效率 | ★ 低 | ★★★★★ 高 | ★★★★ 高 | ★★★★★ 最高 |
| 运维复杂度 | ★★ 低 | ★★★ 中 | ★★★★ 高 | ★★★ 中 |
| 扩展性 | ★ 差 | ★★★★ 好 | ★★★★★ 最好 | ★★★★★ 最好 |
| 启动时间 | 5-10s | <1s | 3-5s | 1-2s |
| 适合阶段 | PoC/50用户 | 500-5000用户 | 2000+用户 | 5000+用户 |

---

## 四、推荐实施路径

### 阶段1: 500用户 — **共享多租户 + Docker资源限制** (近期)

**架构**: 在当前Docker基础上加资源限制 + 共享后端优化

#### 服务器配置
```
AWS EC2 类型: t3.xlarge (4vCPU / 16GB RAM) × 2台
                  或 c6i.2xlarge (8vCPU / 16GB) × 1台
存储: 200GB gp3 SSD (IOPS 3000)
带宽: 最高5Gbps
区域: ap-southeast-1 (新加坡)
月成本预估: $250-350/月
```

#### 资源分配
| 资源 | 每实例 | 500实例总需 | 实际需求(30%并发) |
|------|--------|-----------|----------------|
| 内存 | 128-256MB | 64-128GB | 19-38GB |
| CPU | 0.25核 | 125核 | 37核 |
| 存储 | 500MB | 250GB | 250GB |
| 带宽 | 1Mbps | 500Mbps | 150Mbps(峰值) |

#### 关键改动
```bash
# 1. Docker容器加资源限制
docker run -d \
  --memory=256m --memory-swap=512m \
  --cpus=0.25 \
  --storage-opt size=500m \
  -p 0:3001 \
  --name oc-${instanceId} \
  openclaw/openclaw:latest

# 2. 添加Docker health check
  --health-cmd="curl -f http://localhost:3001/api/health || exit 1" \
  --health-interval=30s \
  --health-retries=3

# 3. 容器空闲自动暂停（Cron检测）
# 30分钟无请求 → docker pause
# 新请求到达 → docker unpause (反向代理触发)
```

#### LLM成本控制
| Provider | 输入价格 | 输出价格 | 500用户月估(每人1000次对话) |
|----------|---------|---------|------------------------|
| DeepSeek V3 | ¥1/百万token | ¥2/百万token | ~$200/月 |
| Claude Haiku | $0.25/百万 | $1.25/百万 | ~$800/月 |
| GPT-4o-mini | $0.15/百万 | $0.6/百万 | ~$400/月 |

**推荐**: 默认DeepSeek，付费用户升级Claude/GPT

---

### 阶段2: 2000用户 — **Kubernetes + 弹性伸缩** (中期)

#### 架构升级
```
AWS EKS (K8s托管服务)
  ├── Node Pool: 基础 (c6i.2xlarge × 2-4台, 按需伸缩)
  ├── Node Pool: GPU (g5.xlarge × 0-2台, 按需) [可选]
  ├── RDS PostgreSQL (db.r6g.large, 多可用区)
  ├── ElastiCache Redis (cache.r6g.large, 集群模式)
  ├── S3 (用户文件/skill存储)
  └── CloudFront CDN
```

#### 资源配置
```yaml
# K8s Pod 资源定义
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "250m"

# HPA 自动伸缩
autoscaling:
  minReplicas: 10        # 最少10个Claw Pod
  maxReplicas: 500       # 最多500个同时运行
  targetCPUUtilization: 60%
  scaleDownStabilization: 300s  # 空闲5分钟缩容
```

| 资源 | 配置 | 月成本 |
|------|------|--------|
| EKS集群 | 控制面 | $73/月 |
| EC2 Node | c6i.2xlarge × 3 | $750/月 |
| RDS | db.r6g.large | $280/月 |
| Redis | cache.r6g.large | $200/月 |
| S3 | 500GB | $12/月 |
| CloudFront | 1TB出流量 | $85/月 |
| LLM API | DeepSeek为主 | $800/月 |
| **合计** | | **~$2,200/月** |

#### 关键能力
- **自动伸缩**: K8s HPA根据CPU/内存自动扩缩Pod
- **零停机部署**: Rolling Update
- **多租户隔离**: K8s Namespace + NetworkPolicy
- **数据持久化**: PVC → EBS/EFS
- **会话亲和**: Sticky Session确保同一用户路由到同一Pod
- **Redis缓存**: 会话状态、Skill缓存、WebSocket relay

---

### 阶段3: 5000用户 — **混合架构 + Serverless** (远期)

#### 架构设计 (参考KimiClaw + CoPaw)

```
                   ┌─────────────────────────┐
                   │    CloudFront CDN        │
                   └───────────┬──────────────┘
                               │
                   ┌───────────▼──────────────┐
                   │    API Gateway / ALB       │
                   └───────────┬──────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
   ┌────────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
   │  常驻服务层(K8s)  │ │ Serverless  │ │  异步任务队列     │
   │  - Auth/User    │ │ (Lambda/FC) │ │  (SQS + Worker)  │
   │  - Marketplace  │ │ - Chat处理   │ │  - Skill同步     │
   │  - Payment      │ │ - Skill执行  │ │  - 数据迁移      │
   │  - WebSocket    │ │ - 轻量推理   │ │  - 报表生成      │
   └─────────────────┘ └─────────────┘ └──────────────────┘
            │                  │                  │
   ┌────────▼──────────────────▼──────────────────▼────────┐
   │              数据层                                     │
   │  RDS Aurora (Multi-AZ) + Redis Cluster + S3 + DynamoDB │
   └───────────────────────────────────────────────────────┘
```

| 资源 | 配置 | 月成本 |
|------|------|--------|
| EKS集群 | c6i.4xlarge × 4-8 | $2,500/月 |
| Lambda | 5000用户 × 100次/天 | $300/月 |
| Aurora | db.r6g.xlarge, Multi-AZ | $800/月 |
| Redis Cluster | 3节点 | $600/月 |
| S3 + DynamoDB | 2TB + 按需 | $100/月 |
| CloudFront | 5TB出流量 | $400/月 |
| LLM API | 混合Provider | $3,000-5,000/月 |
| **合计** | | **~$8,000-10,000/月** |

---

## 五、核心需配置的资源清单

### 1. 算力 (Compute)

| 层级 | 500用户 | 2000用户 | 5000用户 |
|------|---------|---------|---------|
| CPU | 8-16核 | 32-64核 | 64-128核 |
| 内存 | 32-64GB | 64-128GB | 128-256GB |
| GPU | 无需 | 可选(推理加速) | 推荐2×T4/L4 |
| 实例类型 | t3.xlarge × 2 | c6i.2xlarge × 3 | c6i.4xlarge × 4-8 |

### 2. 存储 (Storage)

| 层级 | 500用户 | 2000用户 | 5000用户 |
|------|---------|---------|---------|
| 数据库 | 200GB gp3 | RDS 500GB | Aurora 1TB |
| 文件存储 | 本地EBS 500GB | S3 500GB | S3 2TB |
| 缓存 | 本地Redis 4GB | ElastiCache 8GB | Redis Cluster 24GB |
| 用户数据 | 500MB/人 | 500MB/人 | 1GB/人 |

### 3. 带宽 (Bandwidth)

| 层级 | 500用户 | 2000用户 | 5000用户 |
|------|---------|---------|---------|
| 入站 | 100Mbps | 500Mbps | 1Gbps |
| 出站 | 500Mbps | 2Gbps | 5Gbps |
| CDN | 可选 | 推荐 | 必须 |
| WebSocket | 500连接 | 2000连接 | 5000连接 |

### 4. LLM算力 (AI Inference)

| 层级 | 500用户 | 2000用户 | 5000用户 |
|------|---------|---------|---------|
| 并发请求 | 50 | 200 | 500 |
| 日请求量 | 5万 | 20万 | 50万 |
| 月Token | 50亿 | 200亿 | 500亿 |
| 推荐Provider | DeepSeek | DeepSeek + Claude Haiku | 混合 + 自部署vLLM |
| 月成本 | $200-500 | $800-2000 | $3000-8000 |

---

## 六、立即可做的优化（当前架构）

### 1. Docker资源限制 (5分钟)
```diff
// openclaw-connection.service.ts
- docker run -d -p 0:3001 --name ${containerName} --restart=unless-stopped ${envFlags} openclaw/openclaw:latest
+ docker run -d -p 0:3001 --name ${containerName} --restart=unless-stopped \
+   --memory=256m --memory-swap=512m --cpus=0.25 \
+   --health-cmd="curl -sf http://localhost:3001/api/health || exit 1" \
+   --health-interval=30s \
+   ${envFlags} openclaw/openclaw:latest
```

### 2. 空闲容器自动暂停 (省内存)
```bash
# Cron每10分钟执行
docker stats --no-stream --format "{{.Name}} {{.CPUPerc}}" \
  | grep "^oc-" \
  | awk '$2 == "0.00%" { print $1 }' \
  | xargs -r docker pause
```

### 3. 反向代理自动唤醒
Nginx配置在请求到达暂停容器时自动`docker unpause`。

### 4. LLM Provider分级
- 免费用户 → DeepSeek V3 (最便宜)
- Starter → DeepSeek + Claude Haiku
- Pro → 全部Provider可选
- 自带Key → 不消耗平台配额

---

## 七、安全与合规

| 维度 | 当前 | 应做 |
|------|------|------|
| 网络隔离 | 无 | Docker网络命名空间/K8s NetworkPolicy |
| 数据加密 | 传输TLS | + 存储加密(EBS/S3 SSE) |
| 审计日志 | 基础PM2日志 | CloudWatch/ELK |
| 备份 | 无 | 每日DB快照 + S3版本控制 |
| DDoS防护 | 无 | AWS Shield + WAF |
| 合规 | 无 | GDPR数据删除API + 数据驻留策略 |

---

## 总结

| 规模 | 推荐方案 | 月成本 | 核心配置 |
|------|---------|--------|---------|
| **500用户** | EC2 + Docker + 资源限制 | ~$500-800 | 2×t3.xlarge + 200GB gp3 |
| **2000用户** | EKS + RDS + Redis + S3 | ~$2,200 | 3×c6i.2xlarge + Aurora + ElastiCache |
| **5000用户** | EKS + Serverless混合 + Aurora | ~$8,000-10,000 | 4-8×c6i.4xlarge + Lambda + Aurora Multi-AZ |

**立即行动项**: 给现有Docker容器加 `--memory=256m --cpus=0.25` 限制，防止单个容器耗尽主机资源。
