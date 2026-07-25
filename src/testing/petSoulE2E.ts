import { Platform } from 'react-native';
import { setApiConfig } from '../services/api';
import type { AuthUser, OpenClawInstance } from '../stores/authStore';
import type { PetState } from '../../shared/types/agentrix-presence';
import type { PetClan } from '../../shared/types/pet';

const PET_SOUL_E2E_SCENARIO = 'pet-soul';
const DEFAULT_SOUL_TEMPLATE_ID = 'claw';

type PetPlanLevel = 'free' | 'pro' | 'pro_plus' | 'enterprise';

interface PetSoulSummary {
  id: string;
  clan: PetClan;
  display_name: string;
  display_name_en: string;
  tagline: string;
  archetype: string;
  marketing_hook: string;
  recommended_skin_tags: string[];
  default_idle_emotion: string;
  tier: string;
  age_rating: string;
  required_plan?: PetPlanLevel;
}

interface PetSoulE2EState {
  planLevel: PetPlanLevel;
  activeSoulId: string;
  unlockedSoulIds: string[];
  switchHistory: string[];
}

export interface PetSoulE2ERuntime {
  getState: () => PetSoulE2EState;
  setPlanLevel: (planLevel: PetPlanLevel) => void;
  setUnlockedSoulIds: (ids: string[]) => void;
  setActiveSoul: (id: string) => void;
  reset: () => void;
}

declare global {
  interface Window {
    __AGENTRIX_PET_SOUL_E2E_BOOTSTRAPPED__?: boolean;
    __AGENTRIX_PET_SOUL_E2E_FETCH_MOCKED__?: boolean;
    __AGENTRIX_PET_SOUL_E2E_RUNTIME__?: PetSoulE2ERuntime;
    __AGENTRIX_PET_SOUL_E2E_STATE__?: PetSoulE2EState;
  }
}

const A_OFFICE_SOULS: PetSoulSummary[] = [
  {
    id: 'claw',
    clan: 'A_office',
    display_name: '爪爪',
    display_name_en: 'Claw',
    tagline: '默认主宠',
    archetype: 'ENFP',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'calm',
    tier: 'free',
    age_rating: 'all',
    required_plan: 'free',
  },
  {
    id: 'tinker',
    clan: 'A_office',
    display_name: '叮当',
    display_name_en: 'Tinker',
    tagline: '工坊搭子',
    archetype: 'ISTP',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'focused',
    tier: 'high_arpu',
    age_rating: 'all',
    required_plan: 'pro',
  },
  {
    id: 'sentry',
    clan: 'A_office',
    display_name: '哨兵',
    display_name_en: 'Sentry',
    tagline: '守序执行',
    archetype: 'ISTJ',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'calm',
    tier: 'high_arpu',
    age_rating: 'all',
    required_plan: 'pro',
  },
  {
    id: 'hawk',
    clan: 'A_office',
    display_name: '猎鹰',
    display_name_en: 'Hawk',
    tagline: '情报分析',
    archetype: 'INTJ',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'focused',
    tier: 'high_arpu',
    age_rating: 'all',
    required_plan: 'pro',
  },
  {
    id: 'owl',
    clan: 'A_office',
    display_name: '夜枭',
    display_name_en: 'Owl',
    tagline: '深夜研究员',
    archetype: 'INTJ',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'focused',
    tier: 'high_arpu',
    age_rating: '13+',
    required_plan: 'pro',
  },
  {
    id: 'fox',
    clan: 'A_office',
    display_name: '狐火',
    display_name_en: 'Fox',
    tagline: '创意搭子',
    archetype: 'ENFP',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'excited',
    tier: 'high_arpu',
    age_rating: '13+',
    required_plan: 'pro',
  },
  {
    id: 'dragon',
    clan: 'A_office',
    display_name: '龙脉',
    display_name_en: 'Dragon',
    tagline: '战略中枢',
    archetype: 'INTJ-A',
    marketing_hook: '',
    recommended_skin_tags: [],
    default_idle_emotion: 'focused',
    tier: 'high_arpu',
    age_rating: '18+',
    required_plan: 'pro',
  },
];

function getWebSearchParam(name: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

let _cachedPetSoulE2EEnabled: boolean | null = null;

export function isPetSoulE2EEnabled(): boolean {
  if (_cachedPetSoulE2EEnabled !== null) return _cachedPetSoulE2EEnabled;
  _cachedPetSoulE2EEnabled = getWebSearchParam('e2e') === PET_SOUL_E2E_SCENARIO;
  if (
    !_cachedPetSoulE2EEnabled
    && typeof window !== 'undefined'
    && window.__AGENTRIX_PET_SOUL_E2E_BOOTSTRAPPED__
  ) {
    _cachedPetSoulE2EEnabled = true;
  }
  return _cachedPetSoulE2EEnabled;
}

function normalizeUnlockedSoulIds(ids?: string[] | null): string[] {
  const unique = new Set<string>([DEFAULT_SOUL_TEMPLATE_ID]);
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (typeof id === 'string' && id.trim()) {
        unique.add(id.trim());
      }
    }
  }
  return Array.from(unique);
}

function resolveInitialState(): PetSoulE2EState {
  const planParam = getWebSearchParam('plan');
  const activeSoulId = getWebSearchParam('activeSoul') || DEFAULT_SOUL_TEMPLATE_ID;
  const unlockedParam = getWebSearchParam('unlocked');
  const unlockedSoulIds = normalizeUnlockedSoulIds(
    unlockedParam ? unlockedParam.split(',').map((item) => item.trim()).filter(Boolean) : [DEFAULT_SOUL_TEMPLATE_ID],
  );
  if (!unlockedSoulIds.includes(activeSoulId)) {
    unlockedSoulIds.push(activeSoulId);
  }
  return {
    planLevel:
      planParam === 'free' || planParam === 'pro' || planParam === 'pro_plus' || planParam === 'enterprise'
        ? planParam
        : 'pro',
    activeSoulId,
    unlockedSoulIds,
    switchHistory: [],
  };
}

function getPetSoulState(): PetSoulE2EState {
  if (typeof window === 'undefined') {
    return resolveInitialState();
  }

  if (!window.__AGENTRIX_PET_SOUL_E2E_STATE__) {
    window.__AGENTRIX_PET_SOUL_E2E_STATE__ = resolveInitialState();
  }

  return window.__AGENTRIX_PET_SOUL_E2E_STATE__;
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function buildPetState(): PetState {
  const state = getPetSoulState();
  const now = Date.now();
  return {
    pet_id: 'mobile-pet-e2e-1',
    user_id: 'mobile-user-e2e-1',
    emotion: 'happy',
    emotion_intensity: 2,
    emotion_since: now,
    emotion_decay_at: now + 60_000,
    intimacy_level: 3,
    intimacy_xp: 180,
    recent_memory_snippets: [],
    unlocked_soul_template_ids: [...state.unlockedSoulIds],
    primary_agent_id: 'mobile-agent-e2e-1',
    engine_switching: false,
    soul_template_id: state.activeSoulId,
    active_skin_id: null,
    personality_overrides: {},
    updated_at: now,
  };
}

function listVisibleSouls(): PetSoulSummary[] {
  const state = getPetSoulState();
  return state.planLevel === 'free'
    ? A_OFFICE_SOULS.filter((item) => item.id === DEFAULT_SOUL_TEMPLATE_ID)
    : A_OFFICE_SOULS;
}

function installPetSoulFetchMock(): void {
  if (typeof window === 'undefined' || window.__AGENTRIX_PET_SOUL_E2E_FETCH_MOCKED__) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const requestMethod = (init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const parsedUrl = new URL(requestUrl, window.location.origin);
    const normalizedPath = parsedUrl.pathname.replace(/^\/api/, '');
    const state = getPetSoulState();

    if (requestMethod === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (normalizedPath === '/v1/pet/state' && requestMethod === 'GET') {
      return createJsonResponse(buildPetState());
    }

    if (normalizedPath === '/v1/pet/souls' && requestMethod === 'GET') {
      const clan = parsedUrl.searchParams.get('clan');
      const items = listVisibleSouls().filter((item) => !clan || item.clan === clan);
      return createJsonResponse({
        items,
        access: {
          plan_level: state.planLevel,
        },
      });
    }

    if (normalizedPath.startsWith('/v1/pet/souls/') && requestMethod === 'GET') {
      const templateId = decodeURIComponent(normalizedPath.slice('/v1/pet/souls/'.length));
      const soul = A_OFFICE_SOULS.find((item) => item.id === templateId);
      return soul
        ? createJsonResponse(soul)
        : createJsonResponse({ message: 'not found' }, 404);
    }

    if (normalizedPath === '/v1/pet/soul/switch' && requestMethod === 'POST') {
      const body = JSON.parse(String(init?.body || '{}')) as { templateId?: string };
      const templateId = body?.templateId || '';
      if (!templateId) {
        return createJsonResponse({ message: 'templateId required' }, 400);
      }
      if (state.planLevel === 'free' && templateId !== DEFAULT_SOUL_TEMPLATE_ID) {
        return createJsonResponse(
          { message: '免费套餐只能切换到 Claw（爪爪），升级到 Pro 可解锁更多灵魂' },
          403,
        );
      }
      if (
        state.planLevel === 'pro'
        && !state.unlockedSoulIds.includes(templateId)
        && state.unlockedSoulIds.length >= 3
      ) {
        return createJsonResponse(
          { message: 'Pro 套餐最多解锁 3 只灵魂，请升级到 Pro+ 继续解锁' },
          403,
        );
      }
      if (!state.unlockedSoulIds.includes(templateId)) {
        state.unlockedSoulIds.push(templateId);
      }
      state.activeSoulId = templateId;
      state.switchHistory.push(templateId);
      return createJsonResponse(buildPetState());
    }

    return originalFetch(input as any, init);
  };

  window.fetch = mockedFetch as typeof window.fetch;
  globalThis.fetch = mockedFetch as typeof globalThis.fetch;
  window.__AGENTRIX_PET_SOUL_E2E_FETCH_MOCKED__ = true;
}

function createPetSoulE2ERuntime(): PetSoulE2ERuntime {
  return {
    getState() {
      return { ...getPetSoulState(), unlockedSoulIds: [...getPetSoulState().unlockedSoulIds] };
    },
    setPlanLevel(planLevel) {
      const state = getPetSoulState();
      state.planLevel = planLevel;
      if (planLevel === 'free') {
        state.activeSoulId = DEFAULT_SOUL_TEMPLATE_ID;
        state.unlockedSoulIds = [DEFAULT_SOUL_TEMPLATE_ID];
      }
    },
    setUnlockedSoulIds(ids) {
      const state = getPetSoulState();
      state.unlockedSoulIds = normalizeUnlockedSoulIds(ids);
      if (!state.unlockedSoulIds.includes(state.activeSoulId)) {
        state.activeSoulId = state.unlockedSoulIds[0] ?? DEFAULT_SOUL_TEMPLATE_ID;
      }
    },
    setActiveSoul(id) {
      const state = getPetSoulState();
      state.activeSoulId = id;
      if (!state.unlockedSoulIds.includes(id)) {
        state.unlockedSoulIds.push(id);
      }
    },
    reset() {
      window.__AGENTRIX_PET_SOUL_E2E_STATE__ = resolveInitialState();
    },
  };
}

export function applyPetSoulE2EBootstrap(): boolean {
  if (!isPetSoulE2EEnabled() || typeof window === 'undefined') {
    return false;
  }

  if (window.__AGENTRIX_PET_SOUL_E2E_BOOTSTRAPPED__) {
    return true;
  }

  const instance: OpenClawInstance = {
    id: 'pet-soul-e2e-instance',
    name: 'Pet Soul QA Agent',
    instanceUrl: 'https://agentrix.top/pet-soul-e2e',
    status: 'active',
    deployType: 'cloud',
  };

  const user: AuthUser = {
    id: 'pet-soul-e2e-user',
    agentrixId: 'pet-soul-e2e',
    nickname: 'Pet Soul E2E',
    roles: ['tester'],
    provider: 'email',
    activeInstanceId: instance.id,
    openClawInstances: [instance],
  };

  const { useAuthStore } = require('../stores/authStore');
  useAuthStore.setState({
    user,
    token: 'pet-soul-e2e-token',
    isAuthenticated: true,
    isLoading: false,
    isInitialized: true,
    hasCompletedOnboarding: true,
    hasValidInvitation: true,
    activeInstance: instance,
  });

  setApiConfig({ token: 'pet-soul-e2e-token' });
  installPetSoulFetchMock();
  window.__AGENTRIX_PET_SOUL_E2E_RUNTIME__ = window.__AGENTRIX_PET_SOUL_E2E_RUNTIME__ || createPetSoulE2ERuntime();
  window.__AGENTRIX_PET_SOUL_E2E_BOOTSTRAPPED__ = true;
  return true;
}