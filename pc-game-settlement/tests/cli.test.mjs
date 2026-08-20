import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";

import { parseArgs } from "../scripts/cli.mjs";

const NODE = "C:/Users/wuweixin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";

function assertSettlementRules(document) {
  assert.match(document, /合同初审[^。\r\n]*复审[^。\r\n]*包含\s*[“"]?通过[”"]?/);
  assert.match(document, /(?:不包含|不得包含|排除)[^。\r\n]*不通过/);
  assert.match(
    document,
    /收入(?:金额)?[^。\r\n]*(?:(?:至少|不低于|大于等于)\s*1\s*元|(?:>=|≥)\s*1(?:\s*元)?)/,
  );
}

function assertAmountsRemainNumeric(document) {
  assert.match(document, /金额[^。\r\n]*保持[^。\r\n]*数值\s*或\s*公式/);
  assert.match(document, /不得[^。\r\n]*转(?:换)?成[^。\r\n]*文本/);
}

test("文档规则断言兼容合法表述并拒绝旧口径", () => {
  assert.doesNotThrow(() =>
    assertSettlementRules(
      "合同初审和复审状态均须包含“通过”，且不得包含“不通过”；收入金额必须大于等于1元。",
    ),
  );
  assert.doesNotThrow(() =>
    assertSettlementRules("合同初审和复审状态均需包含通过且排除不通过；收入金额至少1元。"),
  );
  assert.throws(() =>
    assertSettlementRules("合同初审和复审状态都必须精确等于“审核通过”；收入必须非零。"),
  );
});

test("Skill明确结算金额格式、数据类型、合同状态和最低收入规则", async () => {
  const [skill, inputSchema] = await Promise.all([
    fs.readFile("pc-game-settlement/SKILL.md", "utf8"),
    fs.readFile("pc-game-settlement/references/input-schema.md", "utf8"),
  ]);
  assert.match(skill, /#,##0\.00/);
  assertSettlementRules(skill);
  assertAmountsRemainNumeric(skill);
  assert.match(inputSchema, /#,##0\.00/);
  assertSettlementRules(inputSchema);
  assertAmountsRemainNumeric(inputSchema);
});

test("缺少必需参数时返回可识别的参数错误", () => {
  assert.throws(
    () => parseArgs(["--backend", "a.xlsx"]),
    (error) => error.exitCode === 2 && /缺少必需参数/.test(error.message),
  );
});

test("dry-run输出当前样例预检JSON且不生成文件", async () => {
  const args = [
    "pc-game-settlement/scripts/cli.mjs",
    "--backend",
    "C:/Users/wuweixin/Desktop/财务对账明细20260820.xlsx",
    "--companies",
    "C:/Users/wuweixin/Desktop/联运端游公司信息列表.xlsx",
    "--template",
    "C:/Users/wuweixin/Desktop/端游/崩坏：星穹铁道 （端游）202606.xlsx",
    "--output",
    "test-output/cli-dry-run",
    "--exclusions",
    "local/202607-exclusions.json",
    "--dry-run",
  ];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(NODE, args, { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, "dry-run");
  assert.deepEqual(report.stats, {
    totalRows: 28,
    baseEligible: 22,
    baseExcluded: 6,
    manualExcluded: 0,
    ready: 22,
    matchedProducts: 22,
    matchedCompanies: 19,
    companyMissing: 0,
    blockingAnomalies: 0,
  });
});
