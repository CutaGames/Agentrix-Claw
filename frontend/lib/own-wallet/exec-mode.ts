/**
 * L8-6 own wallet, web side: the outer call and execution mode the wallet page accepts (design W2.5 (d), R3-L6). In
 * root mode Kernel does not check the selector, so the signer fixes it here. The same table as the backend assembler
 * and the desktop session signer (`EXEC_MODE_RULES_V1`, vectors `execMode`):
 *
 * - the outer call is `execute(bytes32,bytes)` (`0xe9ae5c53`); `executeUserOp`, a direct `installModule`,
 *   `upgradeTo`, `changeRootValidator`, `invalidateNonce`, … are refused;
 * - callType single 0x00 or batch 0x01, execType default 0x00, the other 30 bytes zero; session UserOps single only;
 * - a call to the account itself is refused except `installModule(1, SocialRecovery, …)` with value 0 in
 *   `deploy_setup` / `install_recovery`.
 */
import { EXEC_MODE_RULES_V1, execModeProblemV1, type OwnWalletExecModeProblemV1 } from '../../../shared/types/agent-own-wallet';
import { decodeExecuteCallV1, decodeSocialRecoveryInstallV1, type OwnWalletExecuteCallV1 } from './userop-decode';

export type OwnWalletExecRefusalV1 = OwnWalletExecModeProblemV1 | 'execution_malformed' | 'self_call_not_allowed';

export type OwnWalletExecCheckV1 = { ok: true; call: OwnWalletExecuteCallV1 } | { ok: false; reasonCode: OwnWalletExecRefusalV1; field: string };

function selfCallAllowed(value: bigint, data: string, purpose: string): boolean {
  if (value !== BigInt(0)) return false;
  for (const rule of EXEC_MODE_RULES_V1.allowedSelfCalls) {
    if (!data.startsWith(rule.selector) || !(rule.purposes as readonly string[]).includes(purpose)) continue;
    if (decodeSocialRecoveryInstallV1(data)) return true;
  }
  return false;
}

/** W2.5 (d) for one UserOp `callData`; on success the decoded executions. */
export function checkExecModeV1(callData: unknown, context: { sender: string; purpose: string; session: boolean }): OwnWalletExecCheckV1 {
  const problem = execModeProblemV1(callData, { session: context.session });
  if (problem) return { ok: false, reasonCode: problem, field: 'userOp.callData' };
  const call = decodeExecuteCallV1(callData as string);
  if (!call || call.executions.length === 0) return { ok: false, reasonCode: 'execution_malformed', field: 'userOp.callData' };
  const sender = String(context.sender).toLowerCase();
  for (let i = 0; i < call.executions.length; i += 1) {
    const e = call.executions[i];
    if (e.target === sender && !selfCallAllowed(e.value, e.data, context.purpose)) return { ok: false, reasonCode: 'self_call_not_allowed', field: `userOp.callData.executions[${i}]` };
  }
  return { ok: true, call };
}
