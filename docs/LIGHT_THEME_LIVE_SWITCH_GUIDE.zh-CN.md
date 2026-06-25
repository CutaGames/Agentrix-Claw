# 移动端 Light Mode 实时切换（免重启）迁移指南

> 状态：**已全量铺开**。全 App 的模块级 StyleSheet 已通过 codemod 包成主题响应式（`themedStyles`），
> 根组件订阅主题模式 → 切换 Light/Dark 时整树重渲染、所有页面实时换肤，无需重启。

## TL;DR（当前实现）
1. `src/theme/useTheme.ts` 提供：
   - `useColors()/useTheme()/useThemedStyles()`（hook,用于精细/即时换肤的关键屏)。
   - **`themedStyles(() => StyleSheet.create({...}))`**:模块级样式的“免 hook”主题化包装。返回一个
     Proxy,每次取样式时按**当前模式**返回对应 StyleSheet(按模式惰性构建并缓存)。
2. `App.tsx` 根组件 `useThemeMode()` 订阅模式 → 切换时**整树重渲染**;配合 `colors` 原地更新 +
   `themedStyles` 按模式取值 → 所有页面(含仅在 JSX 用 `colors.x` 的)实时变色。StatusBar 也跟随。
3. 批量迁移由 codemod 完成:`scripts/codemod-themed-styles.mjs`(babel 定位 `StyleSheet.create`
   调用区间 → 原地字符串包裹,保留全部格式/注释;并注入 `themedStyles` import)。覆盖 ~206 个文件。

## 给新页面/新组件用哪种？
- **模块级 `const styles = StyleSheet.create({...})`**:直接照常写,然后用 codemod 或手动包成
  `themedStyles(() => StyleSheet.create({...}))` 即可(`colors.x` 不用改)。
- **想要“当前可见屏即时换肤、零导航依赖”**:用 hook 版 `useThemedStyles(makeStyles)` + `useColors()`
  (Tab 根 / 设置页已用此法)。

## 背景：为什么默认不能实时切换
模块作用域 `StyleSheet.create({color: colors.text})` 在 import 时就把颜色值“烤”进样式,之后
`setThemeMode()` 改 `colors` 也不会变——只有重渲染且**重新读取**才生效。`themedStyles` 用 Proxy 在
每次访问时按当前模式返回样式,正好解决“冻结”;根组件订阅模式解决“重渲染”。两者合一即实时换肤。

## codemod 复跑
```
node scripts/codemod-themed-styles.mjs            # dry-run,列出将包裹的文件
node scripts/codemod-themed-styles.mjs --apply    # 应用
npx tsc --noEmit                                  # 类型校验(themedStyles<T>(()=>T):T 不改变 styles 类型)
```
幂等:已包裹/已用 `makeStyles` hook 的文件不会被重复处理。

## 背景：为什么默认不能实时切换

绝大多数页面在**模块作用域**这样写样式：

```ts
const styles = StyleSheet.create({ box: { backgroundColor: colors.bg } });
```

`colors.bg` 在**模块 import 时**就被求值，颜色值被「烤」进了 StyleSheet。之后即使
`setThemeMode()` 把 `colors` 改了，这个已注册的样式也不会变——只有 JS bundle 重新
求值（即 App 重载）才会重新着色。**没有任何全局技巧能绕过这一点**（remount 也不行，
因为模块不会重新求值）。所以实时切换必须让页面在**渲染时**读色。

## 基础设施（已完成）

- `src/theme/colors.ts`
  - `darkColors` / `lightColors` 两套调色板，`getPalette(mode)` 取整套。
  - `subscribeTheme(listener)`：订阅主题变化（`useSyncExternalStore` 友好）。
  - `setThemeMode(mode)`：持久化 + 原地改 `colors` + **通知所有订阅者**（实时重渲染）。
- `src/theme/useTheme.ts`（新增）
  - `useThemeMode()` → 当前模式，切换时重渲染。
  - `useColors()` → 当前调色板（按模式 memo）。
  - `useTheme()` → `{ mode, colors, isDark, setMode, toggle }`。
  - `useThemedStyles(makeStyles)` → 按模式 memo 的 StyleSheet。

## 迁移配方（每屏 3 步，可被 `getDiagnostics` 类型校验兜住）

以 `ClawSettingsScreen.tsx` 为样板：

**1. 把模块作用域的 `StyleSheet.create` 改成接收调色板的工厂函数**（用 `function` 声明以便提升）：

```ts
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';

// 之前：const styles = StyleSheet.create({ container: { backgroundColor: colors.bgPrimary }, ... });
// 之后：
function makeStyles(c: Palette) { return StyleSheet.create({
  container: { backgroundColor: c.bgPrimary },
  // ...把块内所有 colors. 批量改成 c.
}); }
```

**2. 在组件里取实时样式 + 调色板：**

```ts
export function MyScreen() {
  const c = useColors();                       // JSX 里 colors.x → c.x
  const styles = useThemedStyles(makeStyles);  // 切换时自动重建
  // ...
}
```

**3. 把 JSX 里散落的 `colors.x`（如 `placeholderTextColor={colors.textMuted}`）改成 `c.x`。**

> 类型安全：`Palette = typeof darkColors`，写错色键会被 TS 直接报错。改完用
> `getDiagnostics` 校验该文件即可，无需跑起 App 就能挡掉绝大多数机械错误。

## 已迁移
- ✅ `src/navigation/MainTabNavigator.tsx`（底部 Tab 栏,框住所有页面)
- ✅ `src/screens/world/WorldHubScreen.tsx`（World 根)
- ✅ `src/screens/world/UnifiedWorldMapScreen.tsx`（世界地图,已重做为可视地图)
- ✅ `src/screens/plaza/PlazaScreen.tsx`（Plaza 根)
- ✅ `src/screens/me/ProfileScreen.tsx`（Me 根)
- ✅ `src/screens/me/ClawSettingsScreen.tsx`（设置页,切换开关所在)

## 待迁移(重进/重启后刷新)
- Summon 根 = `src/screens/agent/AgentChatScreen.tsx`(大型聊天面,体量大,单独排期)。
- 各二级页(订单/技能市场/钱包/创作器/详情等)按优先级逐步迁移。
- 多组件共用 module `styles` 的文件:给**每个用到 styles 的子组件**各加一次 `useThemedStyles(makeStyles)`
  (子组件也是函数组件,可用 hook),见 PlazaScreen / ProfileScreen 的做法。

## 建议迁移优先级（高频可见优先）
1. 四个主 tab 的根屏（Home / World / Plaza / Me）——切换后最直观。
2. 全局共享组件（顶部栏、TabBar、CreationCard 等）——一处改、多处见效。
3. 聊天/创作流等次级页面。
4. 长尾设置/详情页（可最后做，期间靠重启兜底）。

## 注意
- `makeStyles` 用**模块作用域的稳定函数**（不要在组件里内联定义），`useThemedStyles`
  仅按 `mode` memo，稳定工厂最省。
- 组件里写死的十六进制色（非 `colors` token）不会跟随切换；迁移时顺手换成 `c.x`。
- 渐变 `gradients` 目前仍是深色固定值；若要随主题切换，可同样改为按模式取（后续）。
