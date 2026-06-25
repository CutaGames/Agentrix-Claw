#!/usr/bin/env node
/**
 * validate-positioning.mjs
 *
 * Mechanical correctness checks for `docs/agentrix-positioning-2026-05.zh-CN.md`
 * per `.kiro/specs/positioning-revision-2026-05/requirements.md` (C1–C12).
 *
 * Usage:
 *   node desktop/scripts/validate-positioning.mjs           # summary only
 *   node desktop/scripts/validate-positioning.mjs --verbose # per-check details
 *
 * Exit codes:
 *   0 — all 12 checks PASS
 *   1 — at least one FAIL
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const DOC_PATH = resolve(repoRoot, 'docs/agentrix-positioning-2026-05.zh-CN.md');

const verbose = process.argv.includes('--verbose');

function readDoc() {
  try {
    return readFileSync(DOC_PATH, 'utf8');
  } catch (err) {
    console.error(`[validate-positioning] cannot read ${DOC_PATH}: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Extract a section by heading. Returns the text from `## <title>` (or `### <title>`)
 * up to the next heading at the same or shallower depth, exclusive.
 */
function extractSection(doc, heading, depthMarker = '## ') {
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(depthMarker) && l.includes(heading));
  if (start === -1) return null;
  // Determine actual depth of the matched heading line.
  const startLine = lines[start];
  const depthMatch = startLine.match(/^(#+)\s/);
  const depth = depthMatch ? depthMatch[1].length : 2;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= depth) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function countMatches(text, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');
  return (text.match(re) || []).length;
}

const checks = [];
function check(id, label, fn) {
  checks.push({ id, label, fn });
}

// ============================================================
// C1: "❌ 出 VS Code 扩展" must be ZERO matches.
check('C1', '§4 不再硬禁止 VS Code 扩展', (doc) => {
  const n = countMatches(doc, /❌\s*出\s*VS\s*Code\s*扩展/g);
  return { pass: n === 0, detail: `matches=${n} (expected 0)` };
});

// C2-a: "U5" appears at least once.
// C2-b: U5 block does NOT contain "不是核心" applied to U5.
check('C2', '§1 U5 (专业程序员) 已正名 (无删除线/无"不是核心")', (doc) => {
  const section = extractSection(doc, '1.', '## ') || extractSection(doc, '谁是我们的用户', '## ');
  if (!section) return { pass: false, detail: '§1 not found' };
  const hasU5 = /U5/.test(section);
  // "不是核心" must not appear within 4 lines of any U5 reference.
  const lines = section.split('\n');
  let badNear = false;
  for (let i = 0; i < lines.length; i++) {
    if (/U5/.test(lines[i])) {
      const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
      if (/不是核心/.test(window)) badNear = true;
    }
  }
  // Strikethrough form: `~~U5~~` should also not exist.
  const strikethrough = /~~\s*U5\s*~~|~~\s*专业程序员\s*~~/.test(section);
  const pass = hasU5 && !badNear && !strikethrough;
  return {
    pass,
    detail: `hasU5=${hasU5}, badNear=${badNear}, strikethrough=${strikethrough}`,
  };
});

// C3: "Unified_Agent_Plan" or "统一 Agent 套餐" appears at least once.
check('C3', '商业模型 Unified_Agent_Plan 已写入', (doc) => {
  const a = countMatches(doc, /Unified_Agent_Plan/g);
  const b = countMatches(doc, /统一\s*Agent\s*套餐/g);
  const pass = a + b >= 1;
  return { pass, detail: `Unified_Agent_Plan=${a}, 统一 Agent 套餐=${b}` };
});

// C4: "ideBridge" / "IdeBridge" appears at least 2 times (§2 or §3 + §7).
check('C4', 'IdeBridge 在竞争段与路线图都出现', (doc) => {
  const n = countMatches(doc, /ide\s*bridge/gi);
  return { pass: n >= 2, detail: `matches=${n} (expected ≥ 2)` };
});

// C5: §7 (路线图) section contains "VS Code 扩展" or "Cursor 扩展".
check('C5', '§7 路线图 包含 VS Code/Cursor 扩展项', (doc) => {
  const section = extractSection(doc, '7.', '## ') || extractSection(doc, '路线图', '## ');
  if (!section) return { pass: false, detail: '§7 not found' };
  const a = countMatches(section, /VS\s*Code\s*[\/\s]*Cursor\s*扩展/g);
  const b = countMatches(section, /VS\s*Code\s*扩展/g);
  const c = countMatches(section, /Cursor\s*扩展/g);
  const pass = a + b + c >= 1;
  return { pass, detail: `combined=${a}, VS Code 扩展=${b}, Cursor 扩展=${c}` };
});

// C6: "Cursor 是给程序员的" must be ZERO.
check('C6', '已删除排他话术 "Cursor 是给程序员的"', (doc) => {
  const n = countMatches(doc, /Cursor\s*是给程序员的/g);
  return { pass: n === 0, detail: `matches=${n} (expected 0)` };
});

// C7: §0 TL;DR cannot have "面向不会写代码的人的 AI 协作伙伴" as the SOLE one-liner.
//     i.e., the literal phrase must either disappear OR appear together with
//     a complementary sentence mentioning programmers.
check('C7', '§0 TL;DR 不再是排他"非编程"陈述', (doc) => {
  const section = extractSection(doc, '0.', '## ') || extractSection(doc, 'TL;DR', '## ');
  if (!section) return { pass: false, detail: '§0 TL;DR not found' };
  const hasOldPhrase = /面向不会写代码的人的\s*AI\s*协作伙伴/.test(section);
  if (!hasOldPhrase) return { pass: true, detail: 'old exclusive phrase removed' };
  // If old phrase still present, must coexist with programmer-inclusive language.
  const hasInclusive = /(程序员|会写代码|coding|Coding|Cursor|VS\s*Code).{0,40}(\+|和|与|也|都)/s.test(section)
    || /(\+|和|与|也|都).{0,40}(程序员|会写代码|coding|Coding|Cursor|VS\s*Code)/s.test(section);
  return {
    pass: hasInclusive,
    detail: `oldPhrase=${hasOldPhrase}, inclusive=${hasInclusive}`,
  };
});

// C8: §10 contains BOTH non-coder and programmer references.
check('C8', '§10 结论同时点到非编程与程序员', (doc) => {
  const section = extractSection(doc, '10.', '## ') || extractSection(doc, '结论', '## ');
  if (!section) return { pass: false, detail: '§10 not found' };
  const hasNonCoder = /不会写代码|非编程/.test(section);
  const hasCoder = /会写代码|程序员/.test(section);
  // "不会写代码" already contains "会写代码" so check by negation: "会写代码"
  // must appear in a context NOT preceded by "不".
  const coderPositive = /(?<!不)会写代码|程序员/.test(section);
  return {
    pass: hasNonCoder && coderPositive,
    detail: `非编程/不会写代码=${hasNonCoder}, 程序员/会写代码(positive)=${coderPositive}`,
  };
});

// C9: "Coding_Plan_Revenue" or "Coding Plan 营收" appears at least once.
check('C9', 'Coding_Plan_Revenue 概念已写入', (doc) => {
  const a = countMatches(doc, /Coding_Plan_Revenue/g);
  const b = countMatches(doc, /Coding\s*Plan\s*营收/g);
  return { pass: a + b >= 1, detail: `Coding_Plan_Revenue=${a}, Coding Plan 营收=${b}` };
});

// C10: "Simple_Mode" or "Simple 模式" appears in §3.3 OR §10 vicinity.
check('C10', 'Simple Mode 默认承诺已写明', (doc) => {
  const section3 = extractSection(doc, '3.3', '### ') || extractSection(doc, '段位', '### ');
  const section10 = extractSection(doc, '10.', '## ') || extractSection(doc, '结论', '## ');
  const section3text = section3 || '';
  const section10text = section10 || '';
  const a = countMatches(section3text, /Simple[_\s]*Mode|Simple\s*模式/g);
  const b = countMatches(section10text, /Simple[_\s]*Mode|Simple\s*模式/g);
  const total = a + b;
  // Also accept any section containing "首次" + "Simple" near each other.
  const docHasDefault = /首次.{0,40}Simple|Simple.{0,40}首次|默认.{0,10}Simple|Simple.{0,10}默认/s.test(doc);
  return {
    pass: total >= 1 || docHasDefault,
    detail: `§3.3=${a}, §10=${b}, default-phrase=${docHasDefault}`,
  };
});

// C11: "B_Path" or "做新 IDE" appears with "已否决"/"否决" semantics.
check('C11', 'B_Path 做新 IDE 显式标注为已否决', (doc) => {
  // Look for a sentence mentioning B_Path/做新 IDE within ~80 chars of "否决".
  const re = /(B_Path|做新\s*IDE)[\s\S]{0,80}否决|否决[\s\S]{0,80}(B_Path|做新\s*IDE)/g;
  const n = countMatches(doc, re);
  return { pass: n >= 1, detail: `matches=${n} (expected ≥ 1)` };
});

// C12: §5.1 "ChatGPT 帮你想,Agentrix 帮你做" preserved verbatim.
check('C12', '§5.1 给非技术朋友 话术保留', (doc) => {
  const n = countMatches(doc, /ChatGPT\s*帮你想[,，]?\s*Agentrix\s*帮你做/g);
  return { pass: n >= 1, detail: `matches=${n} (expected ≥ 1)` };
});

// ============================================================
// Run all checks
const doc = readDoc();
let pass = 0;
let fail = 0;
const results = [];
for (const c of checks) {
  let res;
  try {
    res = c.fn(doc);
  } catch (err) {
    res = { pass: false, detail: `EXCEPTION: ${err.message}` };
  }
  if (res.pass) pass++;
  else fail++;
  results.push({ ...c, ...res });
}

const totalChecks = checks.length;
console.log(`\nvalidate-positioning.mjs — ${DOC_PATH.replace(repoRoot + '\\', '').replace(repoRoot + '/', '')}`);
console.log('='.repeat(72));
for (const r of results) {
  const tag = r.pass ? '✅ PASS' : '❌ FAIL';
  if (verbose || !r.pass) {
    console.log(`${tag} ${r.id} — ${r.label}`);
    console.log(`        ${r.detail}`);
  } else {
    console.log(`${tag} ${r.id} — ${r.label}`);
  }
}
console.log('='.repeat(72));
console.log(`Result: ${pass}/${totalChecks} PASS, ${fail} FAIL`);

if (fail > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
