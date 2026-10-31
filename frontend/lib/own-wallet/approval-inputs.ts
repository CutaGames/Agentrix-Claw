/**
 * L8-6 own wallet: what the approve page reads itself before running the W2.6 check of a request (design W2.6
 * column "链"): facts from the chain through the pinned public node, and the registration file text from `agentURI`.
 * Nothing here comes from our backend's answer about the UserOp. A read that fails leaves the fact out, and the purpose
 * check then refuses (`chain_fact_missing` / `registration_file_unavailable`); it is never replaced by a default.
 */
import type { OwnWalletChainFactsV1 } from './purpose-checks';
import {
  readErc8004OwnerV1,
  readGuardiansV1,
  readInstallRecoveryFactsV1,
  readPermissionIdsV1,
  readSocialRecoveryInstalledV1,
  readWebAuthnCredentialsV1,
  type OwnWalletPublicChainReaderV1,
} from './public-chain-reader';
import { decodeExecuteCallV1, decodeRegisterCallV1, decodeRegistryCallV1 } from './userop-decode';
import type { OwnWalletWalletRequestV1 } from './userop-hash';

export interface OwnWalletApprovalInputsV1 {
  chain: OwnWalletChainFactsV1;
  registrationFileText?: string;
}

const MAX_FILE = 16384;

async function attempt<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

/** The URI whose file the check needs: `register.agentURI`, or the revocation's `setAgentURI` URI. */
function fileUriOf(request: OwnWalletWalletRequestV1): string | null {
  const call = decodeExecuteCallV1(request.userOp.callData);
  if (!call) return null;
  for (const e of call.executions) {
    const register = decodeRegisterCallV1(e.data);
    if (register) return register.agentURI;
    const registry = decodeRegistryCallV1(e.data);
    if (registry && registry.fn === 'setAgentURI') return registry.uri;
  }
  return null;
}

function revokedAgentIdOf(request: OwnWalletWalletRequestV1): bigint | null {
  const call = decodeExecuteCallV1(request.userOp.callData);
  if (!call) return null;
  for (const e of call.executions) {
    const registry = decodeRegistryCallV1(e.data);
    if (registry && registry.fn === 'transferFrom') return registry.agentId;
  }
  return null;
}

export async function approvalInputsV1(
  request: OwnWalletWalletRequestV1,
  deps: { reader: OwnWalletPublicChainReaderV1 | null; fetchText: (url: string) => Promise<string>; fileBaseUrl: string },
): Promise<OwnWalletApprovalInputsV1> {
  const chain: OwnWalletChainFactsV1 = {};
  const reader = deps.reader && deps.reader.chainId === request.chainId ? deps.reader : null;
  const account = request.accountAddress;
  if (reader) {
    switch (request.purpose) {
      case 'install_recovery': {
        const facts = await attempt(() => readInstallRecoveryFactsV1(reader, account));
        if (facts) Object.assign(chain, facts);
        break;
      }
      case 'set_guardians': {
        const installed = await attempt(() => readSocialRecoveryInstalledV1(reader, account));
        if (installed !== undefined) chain.socialRecoveryInstalled = installed;
        if (installed === true) {
          const g = await attempt(() => readGuardiansV1(reader, account));
          if (g) {
            chain.guardians = g.guardians;
            chain.guardianThreshold = g.threshold;
          }
        }
        break;
      }
      case 'remove_credential': {
        const c = await attempt(() => readWebAuthnCredentialsV1(reader, account));
        if (c) {
          chain.credentials = c.credentials.map((k) => ({ pubKeyX: k.pubKeyX, pubKeyY: k.pubKeyY }));
          chain.credentialThreshold = c.threshold;
        }
        break;
      }
      case 'revoke_session': {
        const ids = await attempt(() => readPermissionIdsV1(reader, account));
        if (ids) chain.permissionIds = ids;
        break;
      }
      case 'revoke_registration': {
        const agentId = revokedAgentIdOf(request);
        if (agentId !== null) {
          const owner = await attempt(() => readErc8004OwnerV1(reader, agentId));
          if (owner !== undefined) chain.registrationOwner = owner;
        }
        const ids = await attempt(() => readPermissionIdsV1(reader, account));
        if (ids) chain.permissionIds = ids;
        break;
      }
      default:
        break;
    }
  }
  const inputs: OwnWalletApprovalInputsV1 = { chain };
  const uri = fileUriOf(request);
  // Only our pinned https file base is fetched; `data:` URIs are decoded by the check itself (rehearsal only).
  if (uri && /^https:\/\//.test(deps.fileBaseUrl) && uri.startsWith(`${deps.fileBaseUrl}/`)) {
    const text = await attempt(() => deps.fetchText(uri));
    if (typeof text === 'string' && text.length <= MAX_FILE) inputs.registrationFileText = text;
  }
  return inputs;
}
