# 游戏库扩充:三条路径的状态与对接清单

> 创作流「游戏」内容的扩库策略。三条路径:自研生成 / 自托管开源 / 分发网络。

## 现状总览

| 路径 | 状态 | 说明 |
|---|---|---|
| AI 生成(自研) | ✅ 已上线 | 用户/owner 用 BYO 或平台模型生成自包含 HTML5;接 AXP/offerings/agent 能力。 |
| 自托管开源 | ✅ 已上线 | 4 个 MIT 开源游戏托管在我们自己的域名,稳定可控合规。 |
| 自上传外链 | ✅ 已上线 | owner 在创作页粘贴白名单内 https 游戏 URL 接入。 |
| 分发网络 SDK | 🟡 就绪待对接 | 技术口子已留(域名白名单);批量导入需真实合作账号(见下)。 |

## 已完成

### 自托管开源游戏(更稳更合规)
- 后端 `backend/games/<slug>/` 静态服务,公网 `https://api.agentrix.top/api/games/<slug>/`。
- 已迁入 4 个 MIT 开源游戏(不再依赖第三方 GitHub Pages 可用性):
  - **2048**(gabrielecirulli/2048)
  - **Hextris**(Hextris/hextris)
  - **Astray**(wwwtyro/Astray)
  - **Clumsy Bird**(ellisonleao/clumsy-bird,gh-pages 构建产物)
- 再加新开源游戏 = 服务器上 `git clone` 到 `backend/games/<slug>/`(含 index.html)+ 一条
  `creation` + `creation_game_bundle(source='embed', url=自托管, provider='opensource')` 种子。
  脚本范式见 `.tmp_apk/deploy-selfhost-games.sh`。
- 合规:MIT 允许再托管,需保留各游戏的 LICENSE/署名(建议在各 `games/<slug>/` 保留原 LICENSE 文件)。

## 分发网络 SDK(②)对接清单 —— 需要的资源

技术侧**已就绪**:embed 白名单已含 `gamedistribution.com / crazygames.com / gamemonetize.com / poki.com / itch.io`,
拿到任一合作方的游戏 URL 即可经 `POST /:id/embed-game` 或种子直接上架。**缺的是商务/账号**:

1. **合作方账号 + 域名登记**:GameDistribution / CrazyGames / GameMonetize 等都要求注册开发者/发布者账号,
   并把我们的承载域名(`agentrix.top`/app)加入其白名单(否则其 SDK 校验 referrer 会拒绝加载或不计收益)。
2. **游戏目录 API / Feed**:如 GameDistribution 提供游戏 feed(分类/缩略图/嵌入 URL)。拿到 API key 后,
   可写一个 ingestion 任务把一批游戏批量落成 `creation + embed bundle`(标题/简介/缩略图/URL)。
3. **收益分成协议**:这些网络靠广告变现并与发布者分成;需确认分成比例、结算方式、是否允许在 App 内嵌(部分仅限 Web)。
4. **广告与合规**:其游戏多含广告/追踪,需评估隐私合规(尤其国内)、是否对未成年人合规、以及 App 商店政策。

> 一旦拿到合作账号 + API key,批量导入是「调 feed → 落库种子」的工作量(小),我可以直接写 ingestion 脚本。
> 在此之前,不应抓取/嵌入未授权的第三方游戏(侵权 + 其 referrer 校验也会失败)。

## 重要边界
- 外链/嵌入游戏(自托管开源、自上传、分发网络)都是**纯玩黑盒**:不接 AXP 打赏 / offerings / agent 可调用能力。
  要进经济闭环,得走「AI 生成的自研游戏」或让来源方专门集成。
- embed 为放宽沙箱(已获产品同意):运行期只挡非 https/危险 scheme,合规靠**注册期域名白名单**。
  建议后续把白名单改为后台可配置 + 加入审核开关(恶意/不良内容)。
