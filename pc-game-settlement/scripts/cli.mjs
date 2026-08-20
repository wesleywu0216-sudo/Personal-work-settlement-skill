import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { prepareBatch } from "./lib/rules.mjs";
import { writeSummaryWorkbook } from "./lib/summary.mjs";
import { validateSettlementWorkbook } from "./lib/validate.mjs";
import {
  readBackendWorkbook,
  readCompanyWorkbook,
  settlementOutputFileName,
  writeSettlementWorkbook,
} from "./lib/workbooks.mjs";

const VALUE_FLAGS = new Set(["backend", "companies", "template", "output", "exclusions"]);
const REQUIRED = ["backend", "companies", "template", "output"];

function argumentError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

export function parseArgs(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (!token.startsWith("--")) throw argumentError(`无法识别参数：${token}`);
    const key = token.slice(2);
    if (!VALUE_FLAGS.has(key)) throw argumentError(`无法识别参数：${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw argumentError(`参数${token}缺少值`);
    options[key] = value;
    index += 1;
  }
  const missing = REQUIRED.filter((key) => !options[key]);
  if (missing.length > 0) throw argumentError(`缺少必需参数：${missing.map((key) => `--${key}`).join("、")}`);
  return options;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function loadExclusions(filePath) {
  if (!filePath) return [];
  const value = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!Array.isArray(value)) throw argumentError("人工排除文件必须是JSON数组");
  return value;
}

function dryRunReport(batch) {
  return {
    mode: "dry-run",
    stats: batch.stats,
    manualExclusions: batch.excluded
      .filter((item) => item.type === "人工排除")
      .map((item) => ({ game: item.row.游戏名称, company: item.row.企业名称, reason: item.reason })),
    anomalies: batch.anomalies.map((item) => ({
      game: item.row.游戏名称,
      company: item.row.企业名称,
      type: item.type,
      details: item.details,
    })),
  };
}

export async function run(options) {
  const sourceHashes = {
    backend: await sha256File(options.backend),
    companies: await sha256File(options.companies),
    template: await sha256File(options.template),
  };
  const [backend, companies, exclusions] = await Promise.all([
    readBackendWorkbook(options.backend),
    readCompanyWorkbook(options.companies),
    loadExclusions(options.exclusions),
  ]);
  const batch = prepareBatch(backend.rows, companies.rows, exclusions);
  if (options.dryRun) return dryRunReport(batch);

  const months = [...new Set(batch.ready.map((row) => row.monthKey))];
  if (months.length !== 1) {
    throw new Error(`正式生成要求唯一月份，当前为：${months.join("、") || "无可生成记录"}`);
  }
  const outputDir = path.resolve(options.output);
  const summaryPath = path.join(outputDir, `端游结算单生成汇总_${months[0]}.xlsx`);
  if (await fileExists(summaryPath)) {
    throw new Error(`汇总文件已存在，按不覆盖规则停止：${summaryPath}`);
  }
  await fs.mkdir(outputDir, { recursive: true });

  const generatedReady = [];
  const generatedFiles = [];
  const runtimeAnomalies = [...batch.anomalies];
  for (const row of batch.ready) {
    const outputPath = path.join(outputDir, settlementOutputFileName(row));
    if (await fileExists(outputPath)) {
      runtimeAnomalies.push({ row, type: "同名文件已存在", details: outputPath });
      continue;
    }
    await writeSettlementWorkbook({ templatePath: options.template, row, outputPath });
    const validation = await validateSettlementWorkbook(outputPath, row);
    if (validation.status !== "PASS") {
      runtimeAnomalies.push({ row, type: "输出验证失败", details: validation });
      continue;
    }
    generatedReady.push(row);
    generatedFiles.push(outputPath);
  }

  const executionBatch = {
    ...batch,
    ready: generatedReady,
    anomalies: runtimeAnomalies,
    stats: {
      ...batch.stats,
      ready: generatedReady.length,
      blockingAnomalies: runtimeAnomalies.length,
    },
  };
  await writeSummaryWorkbook({
    batch: executionBatch,
    outputPath: summaryPath,
    metadata: {
      backendPath: path.resolve(options.backend),
      companyPath: path.resolve(options.companies),
      templatePath: path.resolve(options.template),
      outputDir,
      runAt: new Date().toISOString(),
      sourceHashes,
    },
  });

  const afterHashes = {
    backend: await sha256File(options.backend),
    companies: await sha256File(options.companies),
    template: await sha256File(options.template),
  };
  if (JSON.stringify(sourceHashes) !== JSON.stringify(afterHashes)) {
    throw new Error("源文件哈希在运行后发生变化");
  }
  return {
    mode: "generated",
    stats: executionBatch.stats,
    generatedFiles,
    summaryPath,
    sourceHashesUnchanged: true,
  };
}

async function main() {
  try {
    const report = await run(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
