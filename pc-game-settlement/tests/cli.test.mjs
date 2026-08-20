import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";

import { parseArgs } from "../scripts/cli.mjs";

const NODE = "C:/Users/wuweixin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";

function assertSettlementRules(document) {
  assert.match(document, /合同初审[^。\r\n]*复审[^。\r\n]*(?:必须|需要|应当|均需|都要)[^。\r\n]*包含[^。\r\n]*(?<!不)通过/);
  assert.match(document, /(?:不包含|不得包含|排除)[^。\r\n]*不通过/);
  assert.match(document, /收入(?:金额)?[^。\r\n]*(?:至少\s*1\s*元|(?:>=|≥)\s*1(?:\s*元)?)/);
}

test("Skill明确结算金额格式、合同状态和最低收入规则", async () => {
  const [skill, inputSchema] = await Promise.all([
    fs.readFile("pc-game-settlement/SKILL.md", "utf8"),
    fs.readFile("pc-game-settlement/references/input-schema.md", "utf8"),
  ]);
  assert.match(skill, /#,##0\.00/);
  assertSettlementRules(skill);
  assert.match(inputSchema, /#,##0\.00/);
  assertSettlementRules(inputSchema);
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
