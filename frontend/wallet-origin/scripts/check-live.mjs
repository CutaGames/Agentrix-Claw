#!/usr/bin/env node
/**
 * L8-6 wallet origin live check (design 2.0 "子域和端口不变量" item 5, R3-M1, R4-L2, M7). Plain Node, no dependency.
 *
 *   node wallet-origin/scripts/check-live.mjs --host wallet.agentrix.top --allowlist <wallet-origin-cert-allowlist.json>
 *
 * Fails (exit 1, one line per problem) when:
 *  - the certificate transparency log (crt.sh public JSON) has any unexpired certificate for a name below the wallet
 *    host (`<x>.wallet.agentrix.top` or `*.wallet.agentrix.top`);
 *  - it has any unexpired wildcard certificate for the parent domain (`*.agentrix.top`);
 *  - an unexpired certificate for the wallet host itself has a public key (SPKI SHA-256) that is not in the allowlist
 *    release keeps after each renewal (`{ "spkiSha256": ["<hex>", …] }`, fingerprints only);
 *  - a random name below the wallet host resolves (a wildcard DNS record), or the lookup is inconclusive;
 *  - `https://<host>/.well-known/webauthn` answers anything but 404 (no Related Origin Requests, V12).
 * It only reports. Turning the main switch off on a failure is the operator's step (flags-checklist).
 */
import { X509Certificate, createHash, randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function namesOf(entry) {
  const raw = [entry && entry.name_value, entry && entry.common_name].filter((v) => typeof v === 'string').join('\n');
  return Array.from(new Set(raw.split(/\s+/).map((n) => n.trim().toLowerCase()).filter(Boolean)));
}

function unexpired(entry, now) {
  const notAfter = Date.parse(entry && typeof entry.not_after === 'string' ? (entry.not_after.endsWith('Z') ? entry.not_after : `${entry.not_after}Z`) : '');
  return Number.isNaN(notAfter) ? true : notAfter > now.getTime();
}

/** Certificates for any name below the wallet host. Unparseable expiry counts as unexpired (fail closed). */
export function subdomainCertificateProblems(entries, walletHost, now = new Date()) {
  const host = walletHost.toLowerCase();
  const problems = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!unexpired(e, now)) continue;
    for (const name of namesOf(e)) if (name.endsWith(`.${host}`)) problems.push(`subdomain_certificate:${name}:${e.id}`);
  }
  return problems;
}

/** Wildcard certificates of the parent domain (they are valid for the wallet host too). */
export function parentWildcardProblems(entries, parentDomain, now = new Date()) {
  const wildcard = `*.${parentDomain.toLowerCase()}`;
  const problems = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!unexpired(e, now)) continue;
    if (namesOf(e).includes(wildcard)) problems.push(`parent_wildcard_certificate:${wildcard}:${e.id}`);
  }
  return problems;
}

/** The unexpired entries that name the wallet host itself (their keys are checked against the allowlist). */
export function baseNameEntries(entries, walletHost, now = new Date()) {
  const host = walletHost.toLowerCase();
  return (Array.isArray(entries) ? entries : []).filter((e) => unexpired(e, now) && namesOf(e).includes(host));
}

/** `certs`: `{ id, spkiSha256 }` (hex, or null when the certificate could not be read: fail closed). */
export function allowlistProblems(certs, allowlist) {
  const allowed = new Set((Array.isArray(allowlist) ? allowlist : []).map((h) => String(h).toLowerCase()));
  const problems = [];
  for (const c of certs) {
    if (typeof c.spkiSha256 !== 'string') problems.push(`certificate_unreadable:${c.id}`);
    else if (!allowed.has(c.spkiSha256.toLowerCase())) problems.push(`certificate_not_in_allowlist:${c.id}:${c.spkiSha256}`);
  }
  return problems;
}

/** `result`: `{ resolved: true }` or `{ resolved: false, code }` from resolving a random name below the wallet host. */
export function randomSubdomainProblem(result, name) {
  if (result && result.resolved === true) return `wildcard_dns:${name}`;
  if (result && (result.code === 'ENOTFOUND' || result.code === 'ENODATA')) return null;
  return `dns_inconclusive:${name}:${result && result.code ? result.code : 'unknown'}`;
}

/** `/.well-known/webauthn` on the wallet host must be 404. */
export function wellKnownProblem(status) {
  return status === 404 ? null : `well_known_webauthn_status:${status}`;
}

/** SPKI SHA-256 (hex) of a PEM certificate. */
export function spkiSha256OfPem(pem) {
  const cert = new X509Certificate(pem);
  return createHash('sha256').update(cert.publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
}

async function crtSh(query) {
  const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(query)}&output=json`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`crt_sh_status_${res.status}`);
  return res.json();
}

function argOf(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv) {
  const host = (argOf(argv, '--host') || 'wallet.agentrix.top').toLowerCase();
  const parent = host.split('.').slice(1).join('.');
  const allowlistPath = argOf(argv, '--allowlist');
  const problems = [];
  let allowlist = [];
  if (!allowlistPath) problems.push('allowlist_missing');
  else {
    try {
      const parsed = JSON.parse(readFileSync(resolve(allowlistPath), 'utf8'));
      allowlist = Array.isArray(parsed.spkiSha256) ? parsed.spkiSha256 : [];
    } catch {
      problems.push('allowlist_unreadable');
    }
  }
  try {
    const below = await crtSh(`%.${host}`);
    problems.push(...subdomainCertificateProblems(below, host));
    const parentEntries = await crtSh(`%.${parent}`);
    problems.push(...parentWildcardProblems(parentEntries, parent));
    const base = baseNameEntries(await crtSh(host), host);
    const certs = [];
    for (const e of base) {
      try {
        const res = await fetch(`https://crt.sh/?d=${encodeURIComponent(String(e.id))}`);
        certs.push({ id: e.id, spkiSha256: res.ok ? spkiSha256OfPem(await res.text()) : null });
      } catch {
        certs.push({ id: e.id, spkiSha256: null });
      }
    }
    problems.push(...allowlistProblems(certs, allowlist));
  } catch (error) {
    problems.push(`ct_log_unavailable:${error && error.message ? error.message : 'error'}`);
  }
  const random = `${randomBytes(8).toString('hex')}.${host}`;
  let dnsResult;
  try {
    await dns.resolve4(random);
    dnsResult = { resolved: true };
  } catch (error) {
    dnsResult = { resolved: false, code: error && error.code };
  }
  const dnsProblem = randomSubdomainProblem(dnsResult, random);
  if (dnsProblem) problems.push(dnsProblem);
  try {
    const res = await fetch(`https://${host}/.well-known/webauthn`, { redirect: 'manual' });
    const p = wellKnownProblem(res.status);
    if (p) problems.push(p);
  } catch {
    problems.push('well_known_webauthn_unreachable');
  }
  for (const p of problems) console.error(`check-live: ${p}`);
  if (problems.length === 0) console.log(`check-live: ${host} ok`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
