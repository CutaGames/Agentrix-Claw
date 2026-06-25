# 系统悬浮球显示「一排小宠物」(精灵表未裁剪)修复 (2026-06-05)

P-9 mobile-pet-companion-redesign T13 的 Android 系统级悬浮球(SYSTEM_ALERT_WINDOW)Bug。

## 症状
App 退到后台时,桌面悬浮球在紫色圆里显示**一排多个微缩宠物**(整张横向精灵表
sprite-sheet 被原样塞进圆里),和 in-app 悬浮球(单帧正确)长得不一样。

## 根因(已确认)
- 真正渲染的系统 overlay 是 `android/app/src/main/java/app/agentrix/claw/AndroidBackgroundWakeWordService.kt`
  的 `updateOverlay()`(由唤醒词前台服务驱动)。`ambientPresence/androidOverlay.ts` 期待的
  `CompanionOverlayModule` 原生模块**不存在**(no-op),所以不是它。
- `updateOverlay()` 用 `setImageResource(companion_ball_default)` + `ImageView.ScaleType.FIT_CENTER`。
- `res/drawable/companion_ball_default.png` 是从 `assets/pets/sprites/default/idle.png` **整张拷贝**的,
  而 idle.png 是 **1024×256 的横向精灵表 = 4 帧 × 256²**(所有 default 精灵都是横向 strip:
  walk/talk 6 帧、idle/eat/jump/listen/... 4 帧、sit 1 帧、alert/sleep 2 帧)。
- FIT_CENTER 把整张 4 帧 strip 缩进正方形 → 一排 4 个小宠物。
- in-app 的 `src/components/PetSpriteImage.tsx` 是用 `overflow:hidden` 裁出**一帧**(translateX 滚帧),
  所以 in-app 永远只显示单帧 → 两者外观不一致。

## 修复(两层,防回归)
1. **资产**:把 `res/drawable/companion_ball_default.png` 重新生成为 idle 的**第 0 帧单帧**
   (idle.png 最左 256×256 裁剪,保留 alpha)。现在是 256×256 ratio=1.0。
   → 与 in-app 静止态(companion mode → idle 精灵)同一形象。
2. **原生兜底**:`updateOverlay()` 改成 `BitmapFactory.decodeResource` 解码 drawable,
   若 `width > height`(横向 strip)则 `Bitmap.createBitmap(sheet,0,0,sheet.height,sheet.height)`
   裁最左正方形帧再 `setImageBitmap`;否则直接用。即使以后又有人把 sheet 拷进来也只显示 1 帧。
   - 新增 import:`android.graphics.Bitmap`、`android.graphics.BitmapFactory`。
   - 裁剪用 decode 后的实际 `sheet.height`,所以 drawable/ 无密度限定被 Android 放大也不影响方形裁剪。

## 验证 / 待办
- getDiagnostics:Kotlin 文件 clean。没动任何 TS 文件。
- **需要 APK 全量重建**(资产+Kotlin 都打进 APK,且 Kotlin 本地编不了 → 看 CI build-apk
  step 18 compileReleaseKotlin / bundle 是否过)。
- ⚠️ 历史教训(见 mobile-4fixes-...-2026-06-04.md):ImageView 没 setWidth/setHeight;
  改原生务必等 CI compileReleaseKotlin 过。
- 没有任何脚本会自动从 idle.png 重生 companion_ball_default.png(grep 过),资产修复稳定。
