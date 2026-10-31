/**
 * L8-6 own wallet, web side: gas and paymaster checks before signing (design W2.5 (e), 7.3, R2-M10, A14). Per chain:
 * the caps and the paymaster rule are the shared ones the backend assembler and the desktop signer also apply.
 *
 * - Testnets 97 / 84532: every gas field within that chain's caps, `paymasterAndData` empty.
 * - Mainnet rule chains (56, 8453): `paymasterAndData` must be non-empty and start with the pinned paymaster; nothing is
 *   pinned or capped for them (A14), so in practice every mainnet request is refused.
 * - Any other chain is refused.
 */
import {
  gasCapsProblemV1,
  paymasterProblemV1,
  OWN_WALLET_MAINNET_PAYMASTER_PINS_V1,
  type OwnWalletGasProblemV1,
  type OwnWalletPaymasterProblemV1,
} from '../../../shared/types/agent-own-wallet';
import { paymasterAndDataOfV1, type OwnWalletUserOpV1 } from './userop-hash';

export type OwnWalletGasCheckV1 = { ok: true } | { ok: false; reasonCode: OwnWalletPaymasterProblemV1 | OwnWalletGasProblemV1; field: string };

/** W2.5 (e) for one UserOp in the RPC form. `pins` exists for tests of the mainnet rule; production uses the shared (empty) pins. */
export function checkUserOpGasV1(chainId: number, op: OwnWalletUserOpV1, pins: Readonly<Record<string, string>> | null = OWN_WALLET_MAINNET_PAYMASTER_PINS_V1): OwnWalletGasCheckV1 {
  let paymasterAndData: string;
  try {
    paymasterAndData = paymasterAndDataOfV1(op);
  } catch {
    return { ok: false, reasonCode: 'paymaster_data_malformed', field: 'userOp.paymaster' };
  }
  const pm = paymasterProblemV1(chainId, paymasterAndData, pins);
  if (pm) return { ok: false, reasonCode: pm, field: 'userOp.paymaster' };
  const gas = gasCapsProblemV1(chainId, op);
  if (gas) return { ok: false, reasonCode: gas, field: 'userOp.gas' };
  return { ok: true };
}
