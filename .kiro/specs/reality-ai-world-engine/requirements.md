# Requirements Document

## Introduction

Reality → AI World Engine（Phase 1: AI UGC Engine）是 Agentrix 平台的核心新功能方向，将现有的"拍照→3D重建"能力升级为"现实世界数字化入口"。第一阶段聚焦 AI UGC Engine，核心玩法为"拍现实→变游戏世界"，从游戏/社交/UGC 切入，让用户通过手机摄像头将现实物体转化为具有 AI 行为、属性、技能的游戏角色或道具，并与 Agentrix 已有的 Agent 经济系统打通，实现"扫描→生成→赋予Agent→交易"的完整闭环。

**核心设计原则：**
- **"好玩"优先于"精确"**：第一阶段追求的是用户的惊喜感和传播性，不追求工业级3D精度。模型是"语义载体"而非"视觉产品"——用户在意的是 AI 理解了什么、生成了什么有趣的角色，而非模型面数。
- **双轨重建策略**：快速路径（单图，5-15秒出结果）满足即时满足感；精细路径（多图引导，30-90秒）给愿意投入时间的用户。
- **AI 质量引导是核心壁垒**：通过三层智能引导（实时预览→即时评分→提交前预测）确保输入质量，而非依赖用户自觉。引导本身就是产品体验的一部分。
- **风格化渲染兜底**：即使原始3D粗糙，通过卡通化/风格化后处理也能让最终效果"好看且有趣"。

MVP 聚焦三个核心 Demo 场景：
1. 拍房间→AI 生成副本（Dungeon Builder）
2. 拍玩具/物品→AI 生成角色（Character Generator）
3. 现实物体大战（Object Battle）

## Glossary

- **Reality_Scanner**: 移动端摄像头扫描模块，负责捕获现实物体图像并通过三层 AI 质量引导系统确保输入质量，然后提交给 3D 重建管线
- **Reconstruction_Engine**: 3D 重建引擎，采用"双轨"策略——快速路径（单图/少图，TripoSR/Meshy API，5-15秒）和精细路径（多图引导，InstantMesh/LGM，30-60秒），第一阶段优先"好玩"而非工业级精度
- **AI_Interpreter**: AI 语义理解模块，分析 3D 模型的形状、材质、功能语义，输出结构化属性描述
- **Quality_Gate**: 三层图像质量门控系统——实时预览引导（拍摄中）、即时质量评分（每帧）、提交前整体评估（生成前）
- **Style_Renderer**: 风格化渲染模块，对粗糙的原始3D模型进行卡通化/风格化后处理，确保即使几何不精确也能产出视觉上"好看"的游戏资产
- **Game_Asset_Generator**: 游戏资产生成器，基于 AI_Interpreter 的语义输出生成游戏属性（HP、攻击力、技能、AI行为树）
- **Dungeon_Builder**: 副本生成器，将房间扫描结果转化为可探索的游戏副本地图
- **Character_Generator**: 角色生成器，将物品扫描结果转化为具有性格、技能、Agent 行为的游戏角色
- **Battle_Arena**: 对战竞技场，支持两个扫描物体生成的角色进行 AI 驱动的战斗
- **World_Asset**: 由现实物体生成的游戏世界资产的统称，包含 3D 模型、属性数据、AI 行为配置
- **Agent_Binding**: 将 World_Asset 绑定到 Agentrix Agent 系统的过程，使资产具有自主行为能力
- **Asset_NFT**: World_Asset 在 Agentrix 经济系统中的可交易表示
- **Scan_Session**: 一次完整的扫描会话，从启动摄像头到生成最终 World_Asset 的全过程
- **AI_Behavior_Tree**: AI 行为树，定义角色在游戏世界中的自主决策逻辑
- **Battle_Animation**: 战斗动画系统，基于角色属性和技能生成实时战斗演出
- **Share_Card**: 可分享的社交卡片，包含 World_Asset 的 3D 预览、属性摘要和邀请链接

## Design Constraints / Tradeoff Notes

本节解释下文 Acceptance Criteria 中关键魔法数字的来源，方便后续 design 阶段在权衡时不至于把它们当作"凭空写下的常量"调整。

- **拍摄距离 15–50 cm**：ARKit/ARCore 的最小可靠深度约 10 cm，50 cm 是单一物体仍能占据画面主体的上限；低于 15 cm 时主流手机的自动对焦会失效。
- **环境亮度阈值 50 lux**：对应典型的室内傍晚光照（一盏台灯约 100 lux，昏暗的客厅约 30–50 lux）。低于此阈值时，特征匹配与 TripoSR 的置信度在 Provider 实测中均显著下降。
- **运动模糊阈值 20% 画面面积**：经验值 — 当超过 20% 的像素呈模糊状态时，单图到 3D 的模型会出现明显幻觉。
- **暴击率上限**：SPD 的取值范围为 1–100，因此公式 `0.10 + spd/1000` 在 SPD=100 时上限为 20% 暴击率，这就是设计上的有意上限。
- **属性总和 150–350（R3.1）**：保证最弱角色仍处在"可玩"的下限，最强角色处在"非常强"的上限，避免出现一击必杀的情况。该范围已与现有 Pet 属性分布对照验证。
- **技能槽成长**：角色创建时已解锁的"成长技能槽"为 0；R3.1 中 2–4 个 Starter Skills 占据固定的 starter 槽位，不计入 R6.4 中通过 XP 解锁的最多 4 个 growth 槽位。（解决先前两条 AC 在槽位语义上的冲突。）
- **免费版 Agent 槽位 = 3**：与现有 `backend/src/modules/workspace/workspace.service.ts` 中 `WorkspacePlan.FREE.maxAgents = 3` 一致；订阅档位 PRO=10 / BUSINESS=50 / ENTERPRISE=200 同样沿用此源数据。

## Requirements

### Requirement 1: 扫描模式选择与 AR 引导

**User Story:** As a mobile user, I want to scan real-world objects using my phone camera with intelligent AI guidance, so that I can produce high-quality input that leads to better game assets.

#### Acceptance Criteria

1. WHEN the user taps the "Scan" button on the mobile home screen, THE Reality_Scanner SHALL present two scan modes: "Quick Scan"（单图/1-3张，快速路径）and "Detail Scan"（多图引导，精细路径），with Quick Scan as the default
2. WHEN the user selects "Quick Scan", THE Reality_Scanner SHALL activate the camera with a simple center-frame guide and require only 1-3 photos of the object's most recognizable angle(s)
3. WHEN the user selects "Detail Scan", THE Reality_Scanner SHALL activate the camera with an AR overlay guide showing a ring of 8 evenly-spaced target positions around the object
4. WHILE in "Detail Scan" mode, THE Quality_Gate SHALL display a 3D bounding box visualization showing which angles have been captured (green) and which are still needed (gray), guiding the user to rotate around the object

### Requirement 14: 三层 Quality Gate 智能引导

**User Story:** As a mobile user, I want layered AI quality guidance during and after capture, so that I am steered toward usable input without being blocked from trying.

(Split out from former Requirement 1 during 2026-05 audit; physically located between Requirement 1 and Requirement 2 for narrative flow.)

#### Acceptance Criteria

**第一层引导：实时预览引导（拍摄中）**

1. WHILE the Reality_Scanner is active, THE Quality_Gate SHALL perform real-time analysis displaying: a distance indicator using ARKit/ARCore depth estimation (valid range: 15-50 cm, vibration haptic when out of range), a lighting indicator that warns with an orange overlay when ambient brightness falls below 50 lux, and a stability indicator that pauses capture when motion blur exceeds 20% of frame area
2. WHILE the Reality_Scanner detects the object is partially occluded (hand covering >30% of object area), THE Quality_Gate SHALL display a "move your fingers" prompt and delay capture

**第二层引导：即时质量评分（每帧拍完）**

3. WHEN each photo is captured, THE Quality_Gate SHALL immediately score it on three dimensions: sharpness (0-100), exposure quality (0-100), and angle novelty (0-100, how much new surface this frame adds), displaying the score as a colored border (green ≥70, yellow 40-69, red <40)
4. IF a captured frame scores below 40 on any dimension, THEN THE Quality_Gate SHALL mark it with a red indicator, display the specific issue ("too blurry" / "too dark" / "same angle as previous"), and offer a one-tap "retake this angle" option
5. WHEN a frame scores above 70 on all dimensions, THE Quality_Gate SHALL provide positive haptic feedback and a green checkmark animation

**第三层引导：提交前整体评估（点生成之前）**

6. WHEN the user has captured the minimum required photos (1 for Quick Scan, 8 for Detail Scan), THE Quality_Gate SHALL compute an overall "Generation Quality Prediction" score (1-5 stars) based on: coverage completeness, average sharpness, lighting consistency, and angle diversity
7. IF the Generation Quality Prediction is below 3 stars, THEN THE Quality_Gate SHALL display specific improvement suggestions (e.g., "add 2 more side-angle shots to improve result" or "retake frame #3, it's too blurry") rather than blocking submission
8. THE Quality_Gate SHALL always allow the user to proceed with generation regardless of quality score, but SHALL display the predicted quality level so the user can make an informed choice
9. WHEN the user taps "Generate", THE Reality_Scanner SHALL submit the captured images to the Reconstruction_Engine and display a progress indicator with estimated remaining time in seconds

### Requirement 15: 扫描容错与边界情况

**User Story:** As a mobile user, I want the scanner to gracefully handle permission, timing, network, and cancellation edge cases, so that I never lose work or get trapped in an unusable state.

(Split out from former Requirement 1 during 2026-05 audit; physically located between Requirement 1 and Requirement 2 for narrative flow.)

#### Acceptance Criteria

1. THE Reality_Scanner SHALL complete the full capture-to-submission flow within 30 seconds for Quick Scan and within 90 seconds for Detail Scan
2. IF the device camera permission is denied or the camera is unavailable, THEN THE Reality_Scanner SHALL display an error message indicating the required permission and provide a button to open device settings
3. IF network connectivity is lost during image submission, THEN THE Reality_Scanner SHALL retain all captured images locally, display an error message indicating the connection failure, and automatically retry submission when connectivity is restored within 5 minutes
4. IF the user cancels the scan session before tapping "Generate", THEN THE Reality_Scanner SHALL discard all captured images for that session and return to the previous screen within 1 second

### Requirement 2: 双轨 3D 重建与语义理解

**User Story:** As a user, I want my scanned object to be quickly reconstructed as a recognizable 3D model with AI-understood properties, prioritizing speed and fun over industrial precision.

#### Acceptance Criteria

**双轨重建策略：**

1. WHEN the user submits images via "Quick Scan" (1-3 photos), THE Reconstruction_Engine SHALL use the fast-track pipeline (TripoSR / Meshy API / equivalent single-image-to-3D model) to generate a stylized 3D mesh within 15 seconds
2. WHEN the user submits images via "Detail Scan" (8+ photos), THE Reconstruction_Engine SHALL use the precision pipeline (InstantMesh / LGM / equivalent multi-view reconstruction) to generate a higher-fidelity 3D mesh within 90 seconds
3. THE Reconstruction_Engine SHALL output all meshes in .glb format with polygon count between 2,000 and 50,000 faces for raw reconstruction output (fast-track targeting 2,000-10,000, precision targeting 10,000-50,000); WHERE the Style_Renderer applies stylization with simplification, the styled output mesh MAY fall below 2,000 faces, but the 2,000–50,000 lower bound applies to the raw reconstruction output prior to stylization
4. THE Reconstruction_Engine SHALL support pluggable backend providers, allowing hot-swap between TripoSR, Meshy API, InstantMesh, LGM, or future providers without client-side changes

**语义理解（两条路径共用）：**

5. WHEN the 3D mesh is generated (either pipeline), THE AI_Interpreter SHALL analyze the mesh geometry, texture patterns, and the original source photos to produce a structured semantic description containing: object category, material type, estimated size (length × width × height in centimeters), functional affordances (maximum 10 tags), and visual style tags (maximum 10 tags)
6. WHEN the AI_Interpreter completes analysis, THE AI_Interpreter SHALL assign a confidence score (0-100) to each semantic attribute
7. IF the AI_Interpreter confidence score for object category is below 60, THEN THE AI_Interpreter SHALL present the user with the top-3 category suggestions and request manual selection within a 60-second timeout period
8. IF the user does not respond to the category selection prompt within 60 seconds, THEN THE AI_Interpreter SHALL automatically assign the highest-confidence category suggestion and proceed with asset creation

**风格化后处理：**

9. WHEN the raw 3D mesh is generated, THE Style_Renderer SHALL apply a stylization pass (selectable from: cartoon, pixel-art, fantasy, sci-fi, realistic) that smooths geometric imperfections and enhances visual appeal, ensuring even low-poly fast-track models look "game-ready"
10. THE Style_Renderer SHALL preserve the object's recognizable silhouette and key visual features (color, proportions, distinctive shapes) while applying stylization
11. THE Style_Renderer SHALL complete the stylization pass within 5 seconds after mesh generation

**质量与容错：**

12. WHEN reconstruction fails due to insufficient image quality, THE Reconstruction_Engine SHALL return a structured error indicating the specific deficiency detected and listing the corrective action (e.g., "try a different angle", "improve lighting", "object too reflective — try matte surface")
13. IF the fast-track pipeline produces a mesh with geometry confidence below 40% (self-assessed), THEN THE Reconstruction_Engine SHALL suggest the user try "Detail Scan" for better results while still delivering the fast-track result
14. IF the Reconstruction_Engine does not complete mesh generation within its time limit (15s fast / 90s precision), THEN THE Reconstruction_Engine SHALL abort the operation, discard partial results, and return a timeout error with retry option
15. THE Reconstruction_Engine SHALL limit client-side processing to image compression (maximum 2MB per compressed image) and upload, with all heavy computation performed server-side

### Requirement 3: 游戏角色生成（Character Generator）

**User Story:** As a user, I want my scanned toy or object to become a game character with personality, skills, and AI behavior, so that I can interact with it as a living entity.

#### Acceptance Criteria

1. WHEN the AI_Interpreter produces a semantic description for a scanned object, THE Character_Generator SHALL generate a complete character profile containing: name (1-30 characters), personality traits (3-5 traits, each 1-3 words), backstory (50-150 words), base stats (HP, ATK, DEF, SPD, INT each ranging from 1 to 100 with a total sum between 150 and 350), and 2-4 unique starter skills each defined by a name (1-25 characters), skill type (offensive/defensive/utility), and effect description (10-50 words); these 2-4 starter skills occupy fixed starter skill slots and are separate from the up to 4 growth skill slots that are unlocked via XP per Requirement 6.4, so the maximum total skills per character SHALL be 2-4 starter skills plus 0-4 growth skills (up to 8 skills total at maximum level)
2. WHEN generating character stats, THE Game_Asset_Generator SHALL derive stat values from the object's physical properties (size→HP, sharpness→ATK, density→DEF, aerodynamics→SPD, complexity→INT) using a deterministic mapping formula such that identical semantic input always produces identical stat output
3. WHEN generating skills, THE Game_Asset_Generator SHALL create skills whose names and effect descriptions incorporate a recognizable reference to the object's real-world function or form (e.g., shoe→"Stomp", cat figurine→"Scratch", Lego block→"Fortify")
4. WHEN the character profile and stats generation is complete, THE Character_Generator SHALL generate an AI_Behavior_Tree containing at least one decision branch for each of the three contexts: idle, combat, and social
5. WHEN character generation is complete, THE Character_Generator SHALL present the full character card to the user with options to regenerate any individual attribute, and WHEN the user regenerates a stat-affecting attribute, THE Character_Generator SHALL recalculate all dependent values while preserving unaffected attributes
6. THE Character_Generator SHALL complete the full generation pipeline (semantic input to character card output) within 15 seconds
7. IF the AI_Interpreter produces a semantic description that is incomplete or malformed, THEN THE Character_Generator SHALL display an error indication to the user specifying which input properties are missing and SHALL not produce a partial character profile

### Requirement 4: 副本生成（Dungeon Builder）

**User Story:** As a user, I want to scan my room and have AI generate a game dungeon from it, so that I can explore a fantasy version of my real space and challenge friends.

#### Acceptance Criteria

1. WHEN the user selects "Room Scan" mode, THE Reality_Scanner SHALL switch to panoramic capture mode displaying a visual progress indicator showing the percentage of 360-degree coverage completed and guiding the user directionally to cover uncaptured angles
2. WHEN the room scan is complete, THE Dungeon_Builder SHALL generate a dungeon map that preserves the room's detected walls, doors, and furniture positions as traversable geometry, applies one of the available fantasy/sci-fi themes, and allows the user to move through all areas corresponding to walkable space in the original room
3. WHEN generating the dungeon, THE Dungeon_Builder SHALL populate the space with AI-generated elements: 3-8 enemies (rooms under 15 m² receive 3-4, rooms 15-30 m² receive 5-6, rooms over 30 m² receive 7-8), 2-5 loot items placed within 1 meter of detected furniture locations, and 1 boss encounter placed at the room's largest detected open area of at least 4 m²
4. WHEN generating enemy types, IF the room's detected objects match a known category (kitchen → fire elementals, bedroom → dream creatures, office → data golems), THEN THE Dungeon_Builder SHALL assign the corresponding enemy theme; IF no known category is matched, THEN THE Dungeon_Builder SHALL assign a default neutral enemy theme
5. WHEN dungeon generation is complete, THE Dungeon_Builder SHALL produce a shareable dungeon code of 6-12 alphanumeric characters that remains valid for 30 days and allows other users to load and attempt the same dungeon layout
6. WHILE dungeon generation is in progress, THE Dungeon_Builder SHALL display a progress indicator and SHALL complete generation within 30 seconds after room scan submission
7. IF the room scan covers less than 180 degrees, THEN THE Dungeon_Builder SHALL generate a partial dungeon with a visible "fog of war" boundary at unscanned edges and SHALL display a prompt offering the user the option to continue scanning to expand the dungeon
8. IF the room scan is interrupted by a device error or camera obstruction before reaching 180 degrees of coverage, THEN THE Dungeon_Builder SHALL retain any captured scan data for 5 minutes and SHALL prompt the user to resume or discard the scan

### Requirement 5: 物体对战系统（Object Battle）

**User Story:** As a user, I want to pit two scanned objects against each other in an AI-driven battle, so that I can have fun comparing everyday items in a game context.

#### Acceptance Criteria

1. WHEN the user selects two World_Asset characters for battle, THE Battle_Arena SHALL generate a turn-based combat sequence using each character's stats and skills, where the battle ends when one character's HP reaches 0 or the maximum turn limit of 20 rounds is reached
2. WHEN a battle begins, THE Battle_Arena SHALL generate a Battle_Animation sequence showing attack effects, damage numbers, and health bar changes rendered in real-time 3D
3. WHEN calculating battle outcomes, THE Battle_Arena SHALL use a deterministic combat formula incorporating stats, skill effects, and a seeded random element for critical hits (seed visible to both players) with a base critical hit probability of 10% modified by the character's SPD stat per the formula `crit_chance = 0.10 + spd / 1000`; given the SPD range of 1-100, this formula produces a critical hit chance capped at 20% when SPD = 100, and this 20% ceiling is the intended maximum
4. WHEN a battle concludes, THE Battle_Arena SHALL display a results screen showing: winner, damage dealt breakdown, MVP skill (the skill that dealt the most total damage), and XP earned by both characters (winner: 30-100 XP, loser: 10-40 XP, scaled by opponent level difference)
5. WHEN one user challenges another user's World_Asset character via a share link, THE Battle_Arena SHALL create an asynchronous battle challenge that expires after 72 hours if not accepted
6. IF a challenged World_Asset is no longer available (deleted, sold, or unbound) when the opponent accepts, THEN THE Battle_Arena SHALL notify both users that the challenge is cancelled and cannot proceed
7. WHEN a battle is complete, THE Battle_Arena SHALL generate a 15-second replay video clip optimized for social media sharing (9:16 aspect ratio, 720p) within 10 seconds of battle conclusion
8. IF the battle reaches the maximum turn limit of 20 rounds without either character's HP reaching 0, THEN THE Battle_Arena SHALL declare the character with the higher remaining HP percentage as the winner
9. THE Battle_Arena SHALL complete battle calculation and animation generation within 10 seconds per combat round

### Requirement 6: Agent 绑定与自主行为

**User Story:** As a user, I want my generated game character to have its own AI Agent that can act autonomously, so that my character feels alive and can participate in the Agentrix economy.

#### Acceptance Criteria

1. WHEN a World_Asset character is created, THE Agent_Binding module SHALL offer the user an option to bind the character to a new Agentrix Agent instance
2. WHEN Agent_Binding is activated, THE Agent_Binding module SHALL configure the Agent with the character's personality traits as system prompt parameters and the AI_Behavior_Tree as decision logic, and SHALL display a confirmation indicating the bound Agent's identifier and active personality configuration
3. WHILE an Agent-bound character has received no user interaction for 5 or more minutes (idle state), THE Agent_Binding module SHALL enable the Agent to perform 1 to 4 autonomous actions per hour selected from: greet the owner, comment on time of day, suggest battles, and interact with other Agent-bound characters in the user's collection
4. WHEN an Agent-bound character wins a battle, THE Agent_Binding module SHALL award the character 10 to 50 XP (scaled by opponent level difference) and unlock 1 additional skill slot at each predefined XP threshold (100, 500, 1500, 5000 XP), up to a maximum of 4 unlocked skill slots
5. THE Agent_Binding module SHALL expose the bound Agent's status and the last 20 autonomous actions (or all actions within the last 24 hours, whichever is fewer) via the existing Agentrix Agent API at `/api/v1/agents/:id/status`
6. IF the user has reached the maximum free Agent slot count (3), THEN THE Agent_Binding module SHALL prompt the user to upgrade their subscription or unbind an existing Agent before allowing a new binding
7. IF Agent_Binding activation fails due to a service error or timeout exceeding 10 seconds, THEN THE Agent_Binding module SHALL display an error message indicating the failure reason and offer a retry option while preserving the World_Asset character in its unbound state

### Requirement 7: 社交分享与病毒传播

**User Story:** As a user, I want to share my created characters, dungeon challenges, and battle results on social media, so that I can invite friends to try the experience.

#### Acceptance Criteria

1. WHEN a World_Asset is created, THE Share_Card module SHALL generate a shareable card containing: 3D model thumbnail (animated GIF, 3 seconds, 1080×1080 pixels), character name, top 3 stats (highest values from HP, ATK, DEF, SPD, INT), and a deep link to view/challenge in the Agentrix app
2. WHEN a dungeon is generated, THE Share_Card module SHALL generate a challenge invitation card (1080×1920 pixels) containing: dungeon preview image, difficulty rating (1-5 stars), creator name, and a deep link that allows the recipient to attempt the dungeon
3. WHEN a battle replay is generated, THE Share_Card module SHALL produce a short video (15 seconds, 9:16 ratio, minimum 720p resolution) with branded watermark positioned in the bottom-right corner and a QR code linking to the app
4. THE Share_Card module SHALL support one-tap sharing to WeChat, Douyin, Instagram, Twitter, and system share sheet
5. WHEN a user opens a shared deep link without the app installed, THE Share_Card module SHALL redirect to a web preview page showing the 3D asset with an app download prompt, loading within 3 seconds on a 4G connection
6. THE Share_Card module SHALL generate all shareable assets within 5 seconds of user request
7. IF share card generation fails or the target sharing platform is unavailable, THEN THE Share_Card module SHALL display an error message indicating the failure reason and offer the option to retry or copy the deep link to clipboard
8. IF a shared deep link target World_Asset has been deleted by its creator, THEN THE Share_Card module SHALL display a notice on the web preview page indicating the asset is no longer available

### Requirement 8: 资产交易与经济系统集成

**User Story:** As a creator, I want to list my generated World Assets on the Agentrix marketplace, so that other users can purchase or trade for my creations.

#### Acceptance Criteria

1. WHEN a user chooses to list a World_Asset for sale, THE Asset_NFT module SHALL create a marketplace listing containing: 3D preview (animated 360-degree rotation, 5 seconds), character stats, skill list, battle record summary, and asking price set by the user within the range of 0.01–999,999.99 USD or 1–10,000,000 AXP
2. IF a user who is not the original creator (scanner) attempts to list a World_Asset for initial sale, THEN THE Asset_NFT module SHALL reject the listing request and display an error message indicating that only the original creator may list the asset for initial sale
3. WHEN payment confirmation is received for a World_Asset purchase, THE Asset_NFT module SHALL place the asset into a "reserved" state for up to 30 seconds while validating the buyer's available Agent slot quota and persisting all transferable state (the bound Agent instance, accumulated XP, and battle history); IF all validations succeed within the 30-second window, THEN THE Asset_NFT module SHALL atomically commit the ownership transfer (asset, bound Agent, XP, battle history) in a single database transaction
4. IF any validation fails or the 30-second reservation window elapses before commit, OR IF the database transaction itself fails (payment failure, Agent slot unavailability on the buyer's account, or any system error), THEN THE Asset_NFT module SHALL release the reservation, refund the buyer in full, leave the asset and its bound Agent with the seller unchanged, and notify both buyer and seller with an error message indicating the failure reason
5. WHEN a World_Asset has been involved in more than 10 battles with a win rate above 70%, THE Asset_NFT module SHALL display an in-app notification to the owner suggesting listing it as a "Battle-Proven" premium asset, shown once per qualifying asset until the user dismisses or acts on it
6. THE Asset_NFT module SHALL calculate a suggested price based on: rarity of source object category (determined by the percentage of marketplace assets sharing the same category), battle record (win count and win rate), skill uniqueness score (number of assets sharing identical skills), and median sale price of comparable assets sold in the preceding 30 days
7. IF the buyer's account has reached the maximum Agent slot count at the time of purchase of an Agent-bound World_Asset, THEN THE Asset_NFT module SHALL inform the buyer before completing the purchase that they must upgrade their subscription or unbind an existing Agent to receive the bound Agent

### Requirement 9: 世界资产管理与收藏

**User Story:** As a user, I want to manage my collection of World Assets in an organized inventory, so that I can easily access, compare, and organize my creations.

#### Acceptance Criteria

1. THE World_Asset inventory screen SHALL display all user-owned assets in a grid view with 3D thumbnail, name, level, and battle record summary (wins/losses/total battles count)
2. WHEN the user has more than 12 World_Assets, THE inventory screen SHALL support filtering by: category (character, dungeon, weapon), source (self-scanned, purchased, gifted), and sort by (newest, highest level, most battles)
3. WHEN the user taps a World_Asset in the inventory, THE inventory screen SHALL display a detail view showing: rotatable 3D model viewer, all base stats (HP, ATK, DEF, SPD, INT), skill descriptions, the most recent 20 battle history entries, and the most recent 20 Agent activity log entries with pagination to load older entries
4. THE inventory screen SHALL display the user's total collection value (estimated based on marketplace comparable prices, refreshed each time the inventory screen is opened) and collection completion badges awarded when the user owns at least one asset in each category (character, dungeon, weapon)
5. WHEN the user long-presses a World_Asset, THE inventory screen SHALL present options: rename (maximum 30 characters), regenerate attributes, bind/unbind Agent, list for sale, gift to friend, and delete
6. IF the user attempts to delete a World_Asset that has an active marketplace listing or pending battle challenge, THEN THE inventory screen SHALL block deletion and display a message indicating the specific blocking reason (active listing or pending challenge)
7. IF the user selects delete on a World_Asset that has no active listing or pending challenge, THEN THE inventory screen SHALL display a confirmation dialog requiring explicit user confirmation before permanently removing the asset
8. IF the user has zero World_Assets, THEN THE inventory screen SHALL display an empty state with a prompt directing the user to the Reality_Scanner to create their first asset

### Requirement 10: 性能与平台适配

**User Story:** As a mobile user, I want the scanning and generation experience to be smooth and responsive on my device, so that I can enjoy the feature without frustration.

#### Acceptance Criteria

1. THE Reality_Scanner SHALL maintain a sustained minimum of 30 FPS (measured as 99th percentile over any 10-second window) during camera preview and AR overlay rendering on devices with at least 4GB RAM and GPU supporting OpenGL ES 3.0
2. THE Reconstruction_Engine SHALL limit client-side processing to image compression (maximum 2MB per compressed image) and upload, with all heavy computation performed server-side; the fast-track pipeline SHALL return results within 15 seconds and the precision pipeline within 90 seconds
3. WHILE any generation process (reconstruction, character, dungeon, battle) is in progress, THE system SHALL display an animated loading state with progress percentage updated at least every 3 seconds and allow the user to navigate away and receive a push notification upon completion
4. IF a generation process does not complete within 3 minutes, THEN THE system SHALL display a timeout error message indicating the failure, cancel the request, and allow the user to retry
5. THE system SHALL cache generated 3D assets locally with a maximum cache size of 500MB, automatically evicting least-recently-used assets when the limit is reached
6. WHEN the device has no network connectivity, THE Reality_Scanner SHALL allow offline photo capture and queue up to 5 generation requests for automatic submission when connectivity is restored, retaining queued requests for a maximum of 7 days
7. IF a queued offline generation request fails upon submission after connectivity is restored, THEN THE system SHALL notify the user with an error message indicating the failed request and offer the option to retry or discard
8. THE system SHALL support iOS 16+ and Android 12+ at full AR overlay quality on devices with at least 4GB RAM, and provide degraded mode (static scan guide overlay without real-time AR tracking, 2D preview instead of 3D) on devices with 2-4GB RAM running iOS 15 or Android 11
9. THE Quality_Gate real-time analysis (distance/lighting/blur detection) SHALL add no more than 2ms latency per frame to the camera preview pipeline
10. THE Style_Renderer SHALL complete stylization within 5 seconds and the resulting styled mesh SHALL render at 30+ FPS on minimum-spec devices

### Requirement 11: 与现有 Agentrix 平台体系的兼容性

**User Story:** As an existing Agentrix user, I want the new World Engine features to coexist with my existing Pet collection, Agent instances, and marketplace listings, so that I do not lose any data or break any current workflows when the feature ships.

#### Acceptance Criteria

1. THE World_Asset entity SHALL be a separate database table from the existing `living_pets` and `family_pets` tables, with no schema changes to those existing tables.
2. THE Agent_Binding module SHALL reuse the existing `WorkspacePlan` agent slot quota (FREE=3, PRO=10, BUSINESS=50, ENTERPRISE=200) defined in the workspace service, rather than introducing a new slot system.
3. WHEN a user has both existing Pets and new World_Assets bound to Agents, THE Agent_Binding module SHALL count both toward the same workspace `maxAgents` quota.
4. THE existing `GET /api/v1/agents/:id/status` response SHALL remain backwards-compatible: any new world-engine fields added to the response SHALL be optional, non-null defaults SHALL not be required, and existing mobile/desktop/wearable clients SHALL continue to function without changes after the world-engine fields are added.
5. THE existing `/api/v1/marketplace` endpoints SHALL continue to function unchanged for non-world-engine assets; world-engine listings SHALL live under a separate `/api/v1/marketplace/world-assets` sub-route.
6. WHEN a World_Asset and a Pet are owned by the same user, THE inventory screen SHALL display both in distinct sections labelled "World Assets" and "Pets", and SHALL not allow battles, trades, or skill transfers between the two systems in Phase 1.
7. IF the integration with the existing Agent system fails (e.g., the Agent slot quota service returns an error), THEN THE World_Asset creation flow SHALL still complete in unbound state, with a clear error message offering retry of the binding step.
8. THE feature SHALL be hidden behind a feature flag `world_engine_enabled` in the existing feature flag system, defaulting to off, so that the rollout can be gated to specific cohorts (e.g., 1% beta → 10% → 100%).

### Requirement 12: 内容审核与合规

**User Story:** As a platform operator, I want every scanned object and generated asset to pass content moderation before it can be shared, listed, or battled, so that the platform avoids hosting infringing, harmful, or illegal content.

#### Acceptance Criteria

1. WHEN the user opens the Reality_Scanner for the first time, THE Reality_Scanner SHALL display a one-time disclaimer requiring acknowledgment that the user owns or has the right to capture the photographed object and is not capturing identifiable people without consent.
2. WHEN images are uploaded, THE system SHALL run an automated face-detection check; IF any captured frame contains a detectable human face occupying more than 5% of the frame area, THEN THE system SHALL reject the upload with a clear "people-scanning is not allowed" error message and SHALL not retain the image beyond the rejection response.
3. WHEN images are uploaded, THE system SHALL run an automated copyrighted-character classifier (covering at minimum Disney, Marvel, Pokémon, Nintendo, and Sanrio characters) using a third-party moderation API or in-house classifier; IF the classifier confidence exceeds 70% for any blocked category, THEN THE system SHALL reject the asset with a "this character is not eligible for scanning" message.
4. WHEN a World_Asset is created, IF the AI_Interpreter's generated name, backstory, or skill effect descriptions contain any term matching the platform's prohibited words list (covering hate speech, sexually explicit terms, violence, and protected-region political terms per existing platform moderation policy), THEN THE Character_Generator SHALL automatically regenerate the offending field up to 3 times before falling back to a safe default ("Mystery Character", neutral backstory).
5. WHEN a user attempts to list a World_Asset on the marketplace, THE Asset_NFT module SHALL submit the asset (3D preview, name, backstory, skills, source-image perceptual hash) to a moderation review queue; THE listing SHALL not become publicly visible until the moderation queue returns "approved", with a target SLA of approval or rejection within 24 hours.
6. THE platform SHALL provide an in-app "Report" button on every shared World_Asset and dungeon, allowing other users to flag suspected infringement, harassment, or other policy violations; reports SHALL be reviewed by the moderation team within 48 hours.
7. IF a World_Asset is determined to violate content policy (either by automated check or by report review), THEN the platform operations team SHALL be able to take down the asset, refund any pending battles, and notify the owner with the violation reason.
8. THE system SHALL store moderation outcomes (decision, reason, reviewer ID, timestamp) for every World_Asset for at least 12 months for audit purposes.
9. WHERE the feature is launched in mainland China, THE Reality_Scanner SHALL additionally enforce the platform's cn-region moderation pipeline (using existing baidu/aliyun moderation APIs already integrated for other features), with all rejected uploads logged for compliance review.

### Requirement 13: 资源配额与成本控制

**User Story:** As a platform operator, I want hard limits on per-user generation usage and visibility into per-asset cost, so that the feature does not run my GPU bill out of control or get abused by bots.

#### Acceptance Criteria

1. THE system SHALL track every Quick Scan, Detail Scan, Room Scan, character generation, dungeon generation, style render, character regeneration, replay video render, and share card render as a usage event in the existing `agent_cost_records` table, recording: user_id, event_type, provider used, processing time, estimated cost in USD, and tier (`fast` or `precision`).
2. THE system SHALL enforce daily quotas per user: free users SHALL be limited to 5 Quick Scans, 1 Detail Scan, 1 Room Scan, and 10 character regenerations per UTC day; PRO subscription users SHALL receive 30 Quick Scans, 5 Detail Scans, 3 Room Scans, and 50 character regenerations per UTC day; BUSINESS and ENTERPRISE users SHALL receive 100 Quick Scans, 20 Detail Scans, 10 Room Scans, and 200 character regenerations per UTC day.
3. WHEN a user reaches a daily quota for any operation, THE system SHALL reject further requests of that type with a clear "daily limit reached" message including the time when the quota resets.
4. THE system SHALL enforce a monthly per-user cost ceiling for free users (default 5 USD equivalent in compute cost); WHEN a free user crosses 80% of the monthly ceiling, THE system SHALL show a soft warning offering subscription upgrade; WHEN the ceiling is reached, THE system SHALL block further generation operations for that user until the next month, until the user upgrades, or until the user purchases additional quota with AXP.
5. THE system SHALL allow users to purchase additional generation quota with AXP at a published exchange rate (initial rates: 1 Quick Scan = 10 AXP, 1 Detail Scan = 50 AXP, 1 Dungeon = 30 AXP, 1 Replay Video = 5 AXP); purchased quota SHALL not roll over more than 30 days from the date of purchase.
6. THE system SHALL apply rate-limiting to prevent automation and bot abuse: a maximum of 1 scan-start request per 10 seconds per user, a maximum of 50 scan-start requests per hour per user, and a maximum of 10 concurrent in-flight reconstruction jobs per user; IF a user exceeds any of these limits, THEN THE system SHALL respond with HTTP 429 and a Retry-After header.
7. THE system SHALL expose admin dashboards showing aggregate cost by Provider (TripoSR self-hosted, Meshy SaaS, InstantMesh self-hosted, GPT-4V, Gemini Vision), top spending users, and rejection-rate breakdown (quota exceeded vs moderation rejected vs technical failure), with dashboard data updated at least every 15 minutes.
8. WHEN a Provider's measured cost-per-call exceeds a configured threshold (e.g., Meshy SaaS calls cost more than 0.10 USD per call), THE Provider Registry SHALL automatically prefer the lower-cost alternative on subsequent requests, falling back to the higher-cost Provider only when the cheaper Provider is unhealthy.

## Out-of-Scope

以下条目在 Phase 1 中**不会**交付，明确列出以避免范围蔓延，留作后续 Phase 候选：

- Web 客户端与桌面客户端 UI（Phase 1 仅支持移动端；唯一的 Web 表面是分享链接的预览页）。
- 实时多人对战（Phase 1 仅支持异步挑战）。
- World Engine 与既有 Pet 系统之间的跨系统资产互转。
- 在用户房间内进行 AR 放置生成的角色（Phase 2 候选项）。
- 用户自训练的自定义风格渲染器（Phase 1 仅提供 5 个固定预设）。
- 公共副本排行榜（仅支持创作者分享码）。
