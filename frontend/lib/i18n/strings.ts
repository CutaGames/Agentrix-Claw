/**
 * Lightweight i18n for the marketing site.
 *
 * Why not next-i18next? next-i18next forces directory-level locale routing
 * and SSG per-locale duplication; that's heavy for a marketing site that
 * already ships ~50 pages. Instead we keep a single URL space and switch
 * dictionaries on the client via a React Context + a `?lang=` query param
 * that persists in `localStorage`.
 *
 * Supported locales (P2-#10): en, zh, ja, ko, es, de
 */

export const LOCALES = ["en", "zh", "ja", "ko", "es", "de"] as const;
export type Locale = typeof LOCALES[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  de: "Deutsch",
};

export const DEFAULT_LOCALE: Locale = "en";

export type Dictionary = Record<string, string>;

export type Catalog = Record<Locale, Dictionary>;

/**
 * Shared marketing strings. Add keys here, then translate per locale.
 * Untranslated keys fall back to `en`.
 */
export const STRINGS: Catalog = {
  en: {
    "nav.product": "Product",
    "nav.tools": "Tools",
    "nav.pricing": "Pricing",
    "nav.docs": "Docs",
    "nav.signin": "Sign in",
    "nav.tryFree": "Try free",
    "tagline.short": "The AI Agent Economy",
    "tagline.long": "Where AI agents work, trade, and grow — across web, mobile, desktop, and wearables.",
    "cta.startBuilding": "Start building",
    "cta.exploreTools": "Explore 30+ tools",
    "tools.heading": "AI tools that ship work",
    "tools.subheading": "Pick a tool, type once, get it done. Powered by Agentrix's auto-routing model graph.",
    "model.auto": "Auto — pick the cheapest adequate model",
    "footer.builtBy": "Built by Agentrix · open agent economy",
  },
  zh: {
    "nav.product": "产品",
    "nav.tools": "工具",
    "nav.pricing": "定价",
    "nav.docs": "文档",
    "nav.signin": "登录",
    "nav.tryFree": "免费试用",
    "tagline.short": "AI Agent 经济平台",
    "tagline.long": "让 AI Agent 在 Web、移动、桌面与穿戴端工作、交易、成长。",
    "cta.startBuilding": "开始构建",
    "cta.exploreTools": "探索 30+ 工具",
    "tools.heading": "可交付成果的 AI 工具",
    "tools.subheading": "选一个工具，输入一次，直接拿到结果。由 Agentrix 自动路由模型驱动。",
    "model.auto": "自动 — 自动选择最优性价比模型",
    "footer.builtBy": "由 Agentrix 构建 · 开放的 Agent 经济",
  },
  ja: {
    "nav.product": "プロダクト",
    "nav.tools": "ツール",
    "nav.pricing": "料金",
    "nav.docs": "ドキュメント",
    "nav.signin": "ログイン",
    "nav.tryFree": "無料で試す",
    "tagline.short": "AI エージェント経済",
    "tagline.long": "AI エージェントが Web、モバイル、デスクトップ、ウェアラブルで働き、取引し、成長する場所。",
    "cta.startBuilding": "構築を始める",
    "cta.exploreTools": "30+ ツールを探す",
    "tools.heading": "成果を出す AI ツール",
    "tools.subheading": "ツールを選び、入力するだけ。Agentrix の自動ルーティングが最適なモデルを選びます。",
    "model.auto": "自動 — 最適なモデルを自動選択",
    "footer.builtBy": "Agentrix 製 · オープンなエージェント経済",
  },
  ko: {
    "nav.product": "제품",
    "nav.tools": "도구",
    "nav.pricing": "가격",
    "nav.docs": "문서",
    "nav.signin": "로그인",
    "nav.tryFree": "무료 체험",
    "tagline.short": "AI 에이전트 경제",
    "tagline.long": "AI 에이전트가 웹, 모바일, 데스크톱, 웨어러블에서 일하고 거래하며 성장합니다.",
    "cta.startBuilding": "시작하기",
    "cta.exploreTools": "30+ 도구 둘러보기",
    "tools.heading": "결과를 만드는 AI 도구",
    "tools.subheading": "도구를 고르고 한 번 입력하면 끝. Agentrix가 최적 모델을 자동 선택합니다.",
    "model.auto": "자동 — 가장 적합한 모델을 자동 선택",
    "footer.builtBy": "Made by Agentrix · 오픈 에이전트 경제",
  },
  es: {
    "nav.product": "Producto",
    "nav.tools": "Herramientas",
    "nav.pricing": "Precios",
    "nav.docs": "Docs",
    "nav.signin": "Iniciar sesión",
    "nav.tryFree": "Prueba gratis",
    "tagline.short": "La economía de agentes IA",
    "tagline.long": "Donde los agentes IA trabajan, comercian y crecen — en web, móvil, escritorio y wearables.",
    "cta.startBuilding": "Empezar a construir",
    "cta.exploreTools": "Explora 30+ herramientas",
    "tools.heading": "Herramientas IA que entregan trabajo",
    "tools.subheading": "Elige una herramienta, escribe una vez, listo. Con auto-routing de modelos de Agentrix.",
    "model.auto": "Auto — elige el modelo más eficiente",
    "footer.builtBy": "Hecho por Agentrix · economía abierta de agentes",
  },
  de: {
    "nav.product": "Produkt",
    "nav.tools": "Tools",
    "nav.pricing": "Preise",
    "nav.docs": "Docs",
    "nav.signin": "Anmelden",
    "nav.tryFree": "Kostenlos testen",
    "tagline.short": "Die KI-Agenten-Ökonomie",
    "tagline.long": "Wo KI-Agenten arbeiten, handeln und wachsen — über Web, Mobile, Desktop und Wearables.",
    "cta.startBuilding": "Loslegen",
    "cta.exploreTools": "30+ Tools entdecken",
    "tools.heading": "KI-Tools, die liefern",
    "tools.subheading": "Tool wählen, einmal eintippen, fertig. Mit Agentrix Auto-Routing.",
    "model.auto": "Auto — wählt das passendste Modell",
    "footer.builtBy": "Built by Agentrix · offene Agentenökonomie",
  },
};

/** Get a translated string, falling back to English then the key itself. */
export function translate(locale: Locale, key: string): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
}
