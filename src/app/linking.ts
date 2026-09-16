/**
 * Deep link configuration — extracted from `App.tsx` by M1.5.1.
 *
 * MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 Sprint A:
 *   - 4-tab IA: Home / Summon / Plaza / Me (canonical)
 *   - Legacy tab names (Agent/Discover/Team/Pet/Wallet/Today) kept as hidden
 *     aliases so existing deep links keep working.
 *   - `resolveLegacyPath()` rewrites incoming paths from the old IA to the new
 *     canonical paths before React Navigation parses them.
 *
 * ⚠️ Import-order trap (design §3 / MTR-R06.4): this module MUST NOT read the
 * agent-first flag at module scope. `createMobileLinking()` is a factory and
 * `getStateFromPath` calls `isAgentFirstIaEnabled()` per invocation, so both
 * resolve *after* `configureMobileV6FeatureFlagsFromEnvironment()` has run.
 * A module-level `const isAgentFirstBuild = …` would evaluate during import
 * hoisting and stably read `false`.
 */
import * as Linking from 'expo-linking';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { resolveLegacyPath } from '../navigation/legacyRouteTable';
import {
  isMobileV7RouteCandidate,
  normalizeMobileV7Route,
} from '../navigation/v7/routeContract';
import { resolveLegacyFamilyPath } from '../navigation/v7/legacyFamilyMap';
import {
  isAgentFirstIaEnabled,
  isPetSurfaceEnabled,
  isWorldPlazaSurfaceEnabled,
} from '../services/mobileV6FeatureFlags';

export { isAgentFirstIaEnabled };

/**
 * Paths whose screens `RootNavigator` no longer mounts (invitation gate and
 * the OpenClaw deploy onboarding moved to Web / Desktop). Kept out of the
 * linking config below; under the V7 IA they land on destination-error
 * instead of resolving to a route that does not exist.
 */
const RETIRED_ROOT_PATHS = /^\/?(invitation-gate|onboarding)(\/|$)/;

export function isRetiredRootPath(path: string): boolean {
  return RETIRED_ROOT_PATHS.test(String(path ?? '').trim());
}

export function resolveIncomingPath(path: string): string {
  if (isAgentFirstIaEnabled()) {
    if (isRetiredRootPath(path)) {
      return '/destination-error?reason=legacy_route_retired';
    }
    if (isMobileV7RouteCandidate(path)) {
      const result = normalizeMobileV7Route(path);
      return result.ok === true
        ? result.path
        : `/destination-error?reason=${encodeURIComponent(result.error.code)}`;
    }
    // Second hop (M1.3.1): under the V7 IA the four current tabs are
    // themselves legacy. Run the legacy table first so pre-4-tab links reach
    // their World/Summon/Plaza/Me form, then map that onto V7. World / Plaza
    // are hidden routes behind `mobile.world_plaza_l2_surface` (default off →
    // destination-error); the Pet family follows `mobile.pet_l2_surface`
    // (default on, kill switch). MTR-R09, decision d-35 — both flags are read
    // here per call, never at module scope.
    const familyPath = resolveLegacyFamilyPath(resolveLegacyPath(path), {
      petSurfaceEnabled: isPetSurfaceEnabled(),
      worldPlazaSurfaceEnabled: isWorldPlazaSurfaceEnabled(),
    });
    if (familyPath !== null) return familyPath;
  }
  return resolveLegacyPath(path);
}

export function createMobileLinking() {
  const agentFirst = isAgentFirstIaEnabled();
  return {
    // Production: Linking.createURL('/') resolves to "agentrix://" (scheme from app.json).
    // Development (Expo Go): resolves to "exp://...". Both are included so QR pairing
    // works on both dev and production builds.
    prefixes: [Linking.createURL('/'), 'agentrix://', 'clawlink://', 'https://clawlink.app', 'https://agentrix.top'],
    getStateFromPath: (path: string, options: any) =>
      defaultGetStateFromPath(resolveIncomingPath(path), options),
    config: {
      screens: {
        Auth: {
          screens: {
            Login: 'login',
            AuthCallback: 'auth/callback',
          },
        },
        // `InvitationGate` / `Onboarding.*` entries removed 2026-09-15: RootNavigator
        // stopped mounting them, so the paths resolved to nothing (see
        // RETIRED_ROOT_PATHS above and docs/mobile-orphan-screens-2026-09-15.md §3).
        Main: {
          screens: {
            ...(agentFirst ? {
              Agent: {
                screens: {
                  AgentHome: 'agents',
                  GoalComposer: 'actions/new',
                  CandidateCompare: 'actions/compare',
                  AuthorityReview: 'actions/:actionId/authority',
                  ActionTracking: 'agents/:agentId/actions/:actionId',
                  Companion: 'agent/companion',
                  Prediction: 'prediction',
                  Lsm: 'lsm',
                  HardwareAssurance: 'agents/:agentId/assurance',
                  AgentSoulCore: 'agents/:agentId/soul-core',
                  DestinationError: 'destination-error',
                },
              },
              Actions: {
                screens: {
                  ActionsHome: 'actions',
                },
              },
              Creation: {
                screens: {
                  CreationHome: 'creation',
                  CreationFeed: 'creation/feed',
                  CreationCreator: 'creation/new',
                  CreationExperience: 'creation/experience/:creationId',
                  CreationDetail: 'creation/:creationId',
                  MyWorld: 'creation/mine',
                  UnifiedWorldMap: 'creation/map',
                  WorldCreationMarketplace: 'creation/market',
                },
              },
            } : {}),
            // AI World Creation Platform (v6) — World tab deep links. The World
            // stack previously had NO linking entries, so its v6 surfaces
            // (map / land / market / creator / experience / task) were only
            // reachable by in-app navigation — unreachable to deep links, Siri/
            // Assistant intents, share links, and Maestro E2E. Add canonical
            // `agentrix://world/*` paths. Screens all handle missing/synthetic
            // ids gracefully (empty state / 10s enter-timeout fallback / "not
            // found"), so a bad id never crashes.
            World: {
              screens: {
                WorldMap: 'world/map',
                LandPlots: 'world/plots',
                WorldCreationMarketplace: 'world/market',
                PlotCreator: 'world/create/:substrateTier/:plotId',
                PlotExperience: 'world/plot/:plotId',
                CreationTaskStatus: 'world/task/:taskId',
                // World Creation & Feed — new unified surfaces. Deep-linkable for
                // Siri/Assistant intents, share links, and Maestro E2E. All screens
                // degrade gracefully on synthetic/missing ids (empty state / 10s
                // enter-timeout fallback / not-found), so a bad id never crashes.
                CreationFeed: 'world/feed',
                UnifiedWorldMap: 'world/explore',
                MyWorld: 'world/mine',
                CreationCreator: 'world/new',
                CreationExperience: 'world/experience/:creationId',
                CreationDetail: 'world/creation/:creationId',
                WorldRoot: 'world',
              },
            },
            Summon: {
              screens: {
                SummonRoot: 'summon',
                VoiceChat: 'summon/voice',
              },
            },
            Plaza: {
              screens: {
                PlazaRoot: 'plaza',
                Skills: 'plaza/skills',
                SkillDetail: 'plaza/skills/:skillId',
                Checkout: 'plaza/checkout/:skillId',
                SkillInstall: 'plaza/skills/install/:skillId',
                Tasks: 'plaza/tasks',
                TaskDetail: 'plaza/tasks/:taskId',
                PostTask: 'plaza/tasks/post',
                Pets: 'plaza/pets',
                PetsSkins: 'plaza/pets/skins',
                SkinAuctionDetail: 'plaza/pets/skins/:auctionId',
                PetAuctionDetail: 'plaza/pets/auction/:auctionId',
                ShareCard: 'plaza/share-card',
                CreateLink: 'plaza/share-card/create',
                ToyCustom: 'plaza/toy/custom',
              },
            },
            [agentFirst ? 'My' : 'Me']: {
              screens: {
                Profile: 'me',
                Account: 'me/account',
                Settings: 'me/settings',
                ReferralDashboard: 'me/promote',
                ApiKeys: 'me/advanced/api-keys',
                LocalAiModel: 'me/advanced/local-ai',
                WalletConnect: 'me/wallet/connect',
                WalletSetup: 'me/wallet/setup',
                WalletBackup: 'me/wallet/backup',
                NotificationCenter: 'me/notifications',
                MySkills: 'me/skills',
                MyOrders: 'me/orders',
                SocialListener: 'me/advanced/social-listener',
                Scan: 'me/scan',
                WearableHub: 'me/devices/wearable',
                Subscribe: 'me/subscribe',
                AxpCenter: 'me/axp',
                AxpRewardShop: 'me/axp/shop',
                ShareCard: 'me/share-card',
                // P-9 Q1 — re-homed pet screens (former PetStack drawer).
                PetWardrobe: 'me/pet/wardrobe',
                SoulPicker: 'me/pet/soul',
                PetBreed: 'me/pet/breed',
                PetPlayground: 'me/pet/playground',
                PetSkinMarketplace: 'me/pet/skins',
                MemoryManagement: 'me/pet/memory',
              },
            },
            // ── Legacy tabs (hidden, but keep deep link compat) ──
            // These are intentionally minimal: the resolver rewrites old
            // paths to new paths, so legacy `config.screens.Agent.*` style
            // links are no longer needed. They remain accessible via
            // legacy `navigate('Agent', { screen: ... })` call sites.
          },
        },
        Inbox: 'inbox',
        Scan: 'scan',
      },
    },
  };
}
