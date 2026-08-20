import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { parseArgs } from "../scripts/cli.mjs";

const NODE = "C:/Users/wuweixin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe";

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
    baseEligible: 18,
    baseExcluded: 10,
    manualExcluded: 1,
    ready: 17,
    matchedProducts: 17,
    matchedCompanies: 15,
    companyMissing: 0,
    blockingAnomalies: 0,
  });
});
