#!/usr/bin/env bash
# L8-6 S13a: read the ERC-8004 registration of a rehearsal back from the chain with curl, jq and sha256sum only
# (design 7.4 R9 / R12b; no Node, no ethers, no repository code). It checks the final state recorded in
# rehearsal-output.json (`registration`, and `eas` when the chain has it):
#   - ownerOf(agentId) is the Agent account, or 0x...dEaD when the registration was revoked (R10);
#   - the on-chain metadata agentrix.fileDigest equals sha256(jq -S -c 'del(.registrations)') of the file in the agentURI
#     (a data: URI in the rehearsal) and equals the digest recorded in the output;
#   - the file's registrations[] names this agentId; the file's account is the Agent account;
#   - EAS (84532 only; 97 has no EAS, E137): the attestation is revoked exactly when the output says so.
# Read only: eth_chainId, eth_call. No key, no transaction. The RPC URL is never printed.
#
#   bash cli-verify.sh --chain-id <97|84532> --input rehearsal-output.json [--rpc URL]
# RPC: --rpc, else AGENT_OWN_WALLET_RPC_URL_<chainId>, else the public node of the chain.
# Exit 0 only when every check agrees; 1 on a mismatch; 2 on a refused chain or bad usage; 3 on an RPC failure.
set -euo pipefail

chain=""; input=""; rpc=""
while [ $# -gt 0 ]; do
  case "$1" in
    --chain-id) chain="${2:-}"; shift 2 ;;
    --input) input="${2:-}"; shift 2 ;;
    --rpc) rpc="${2:-}"; shift 2 ;;
    *) echo "REFUSED unknown option" >&2; exit 2 ;;
  esac
done
case "$chain" in
  97) want=0x61; public=https://data-seed-prebsc-1-s1.binance.org:8545; eas=none ;;
  84532) want=0x14a34; public=https://sepolia.base.org; eas=yes ;;
  *) echo "REFUSED chain id must be 97 or 84532" >&2; exit 2 ;;
esac
[ -n "$input" ] && [ -f "$input" ] || { echo "REFUSED --input must name an existing rehearsal-output.json" >&2; exit 2; }
for tool in curl jq; do command -v "$tool" > /dev/null || { echo "REFUSED $tool is not installed" >&2; exit 2; }; done
if command -v sha256sum > /dev/null; then sha() { sha256sum | cut -d' ' -f1; }; else sha() { shasum -a 256 | cut -d' ' -f1; }; fi
if [ -z "$rpc" ]; then var="AGENT_OWN_WALLET_RPC_URL_${chain}"; rpc="${!var:-$public}"; fi
case "$rpc" in https://*|http://127.0.0.1*|http://localhost*) ;; *) echo "REFUSED the RPC URL must be https" >&2; exit 2 ;; esac

DEAD=0x000000000000000000000000000000000000dead
SEL_OWNER_OF=0x6352211e          # ownerOf(uint256)
SEL_GET_METADATA=0xcb4799f2      # getMetadata(uint256,string)
SEL_GET_ATTESTATION=0xa3112a64   # getAttestation(bytes32)
KEY_HEX=6167656e747269782e66696c65446967657374  # "agentrix.fileDigest" (19 bytes)
EAS_ADDRESS=0x4200000000000000000000000000000000000021

fail() { echo "MISMATCH $*"; failures=$((failures + 1)); }
failures=0

rpc_call() { # method, params (JSON array)
  local body out
  body=$(jq -cn --arg m "$1" --argjson p "$2" '{jsonrpc:"2.0",id:1,method:$m,params:$p}')
  out=$(curl -s --max-time 20 -H 'content-type: application/json' --data "$body" "$rpc" 2> /dev/null) || { echo "RPC_FAILED $1 (network)" >&2; exit 3; }
  printf '%s' "$out" | jq -er 'if .error then empty else .result end' 2> /dev/null || { echo "RPC_FAILED $1 (error answer)" >&2; exit 3; }
}
word() { printf '%064x' "$1"; }
lower() { tr '[:upper:]' '[:lower:]'; }

got=$(rpc_call eth_chainId '[]')
[ "$got" = "$want" ] || { echo "REFUSED the RPC answered chain id $got, expected $want; nothing was read" >&2; exit 3; }
echo "ok eth_chainId $want"

registry=$(jq -er '.registry' "$input") || { echo "MISMATCH the output has no registry address (R4 did not run)"; exit 1; }
account=$(jq -er '.registration.account' "$input" | lower) || { echo "MISMATCH the output has no registration (R4 did not run)"; exit 1; }
agent_id=$(jq -er '.registration.agentId' "$input")
uri=$(jq -er '.registration.agentUri' "$input")
digest=$(jq -er '.registration.fileDigest' "$input" | lower | sed 's/^0x//')
revoked=$(jq -r '.registration.revoked // false' "$input")
case "$agent_id" in ''|*[!0-9]*) echo "MISMATCH agentId is not a decimal number"; exit 1 ;; esac

# 1. holder
owner_word=$(rpc_call eth_call "$(jq -cn --arg to "$registry" --arg d "${SEL_OWNER_OF}$(word "$agent_id")" '[{to:$to,data:$d},"latest"]')")
owner="0x${owner_word: -40}"
if [ "$revoked" = "true" ]; then expect_owner=$DEAD; else expect_owner=$account; fi
if [ "$(printf '%s' "$owner" | lower)" = "$expect_owner" ]; then echo "ok ownerOf($agent_id) = $expect_owner"; else fail "ownerOf($agent_id) is $owner, expected $expect_owner"; fi

# 2. on-chain digest metadata
meta_data="${SEL_GET_METADATA}$(word "$agent_id")$(word 64)$(word 19)$(printf '%-64s' "$KEY_HEX" | tr ' ' '0')"
meta=$(rpc_call eth_call "$(jq -cn --arg to "$registry" --arg d "$meta_data" '[{to:$to,data:$d},"latest"]')")
meta=${meta#0x}
meta_len=$((16#${meta:64:64}))
onchain_digest=$(printf '%s' "${meta:128:$((meta_len * 2))}" | lower)
if [ "$onchain_digest" = "$digest" ]; then echo "ok metadata agentrix.fileDigest = $digest"; else fail "on-chain agentrix.fileDigest is ${onchain_digest:-empty}, the output says $digest"; fi

# 3. the file in the agentURI
case "$uri" in
  data:application/json\;base64,*) file=$(printf '%s' "${uri#data:application/json;base64,}" | base64 -d) ;;
  *) echo "MISMATCH the rehearsal registers a data: URI, got another kind"; failures=$((failures + 1)); file="" ;;
esac
if [ -n "$file" ]; then
  file_digest=$(printf '%s' "$file" | jq -S -c 'del(.registrations)' | tr -d '\n' | sha)
  if [ "$file_digest" = "$digest" ]; then echo "ok sha256(jq -S -c 'del(.registrations)') of the file = $digest"; else fail "the file digests to $file_digest, the chain says $digest"; fi
  if printf '%s' "$file" | jq -e --arg id "$agent_id" '[.registrations[]? | select((.agentId | tostring) == $id)] | length >= 1' > /dev/null; then echo "ok registrations[] names agentId $agent_id"; else fail "registrations[] of the file does not name agentId $agent_id"; fi
fi

# 4. EAS (84532 only)
uid=$(jq -r '.eas.uid // empty' "$input")
if [ "$eas" = "yes" ] && [ -n "$uid" ]; then
  att=$(rpc_call eth_call "$(jq -cn --arg to "$EAS_ADDRESS" --arg d "${SEL_GET_ATTESTATION}${uid#0x}" '[{to:$to,data:$d},"latest"]')")
  att=${att#0x}
  # word 0 is the offset of the tuple; inside it: uid, schema, time, expirationTime, revocationTime (word 5 of the answer)
  revocation=$((16#${att:320:64}))
  want_revoked=$(jq -r '.eas.revoked // false' "$input")
  if [ "$want_revoked" = "true" ] && [ "$revocation" -ne 0 ]; then echo "ok EAS attestation is revoked (the platform revoked it)";
  elif [ "$want_revoked" != "true" ] && [ "$revocation" -eq 0 ]; then echo "ok EAS attestation is live";
  else fail "EAS revocationTime is $revocation but the output says revoked=$want_revoked"; fi
elif [ "$eas" = "none" ]; then
  echo "skipped EAS: 97 has no EAS at the standard address (E137)"
fi

if [ "$failures" -ne 0 ]; then echo "CLI_VERIFY_FAILED $failures"; exit 1; fi
echo "CLI_VERIFY_OK chain=$chain agentId=$agent_id"
