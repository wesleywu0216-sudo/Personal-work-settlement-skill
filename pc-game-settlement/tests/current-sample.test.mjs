import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

import { prepareBatch } from "../scripts/lib/rules.mjs";
import { writeSummaryWorkbook } from "../scripts/lib/summary.mjs";
import { validateSettlementWorkbook } from "../scripts/lib/validate.mjs";
import {
  readBackendWorkbook,
  readCompanyWorkbook,
  writeSettlementWorkbook,
} from "../scripts/lib/workbooks.mjs";

const BACKEND = "C:/Users/wuweixin/Desktop/财务对账明细20260820.xlsx";
const COMPANIES = "C:/Users/wuweixin/Desktop/联运端游公司信息列表.xlsx";
const TEMPLATE = "C:/Users/wuweixin/Desktop/端游/崩坏：星穹铁道 （端游）202606.xlsx";
const EXCLUSIONS = "local/202607-exclusions.json";

async function loadCurrentBatch() {
  const [backend, companies, exclusionsText] = await Promise.all([
    readBackendWorkbook(BACKEND),
    readCompanyWorkbook(COMPANIES),
    fs.readFile(EXCLUSIONS, "utf8"),
  ]);
  return prepareBatch(backend.rows, companies.rows, JSON.parse(exclusionsText));
}

test("当前样例预检得到22基础通过、0人工排除、22可生成", async () => {
  const batch = await loadCurrentBatch();
  assert.deepEqual(batch.stats, {
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

test("原神结算单替换外部引用并写入乙方资料", async () => {
  const batch = await loadCurrentBatch();
  const row = batch.ready.find((item) => item.normalizedGame === "原神");
  assert.ok(row, "当前批次应包含原神");

  const outputDir = path.resolve("test-output/single");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "原神 （端游）202607.xlsx");
  await writeSettlementWorkbook({ templatePath: TEMPLATE, row, outputPath });

  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
  const sheet = workbook.worksheets.getItem("对账单");
  const values = sheet.getRange("A1:M19").values;
  const formulas = sheet.getRange("A1:M19").formulas.flat().filter(Boolean);

  assert.equal(values[2][0], "TO 上海米哈游影铁科技有限公司");
  assert.equal(values[4][0], "2026.07.01-2026.07.31");
  assert.equal(values[4][2], "原神");
  assert.equal(values[4][3], "付费下载");
  assert.equal(values[14][1], "公司名称：上海米哈游影铁科技有限公司");
  assert.equal(values[15][1], "开户银行：招商银行股份有限公司上海田林路支行");
  assert.equal(values[16][1], "银行帐号：121932974610601");
  assert.equal(values[17][1], "联 系 人 ：结算组");
  assert.equal(values[18][1], "电      话：15316926375");

  assert.equal(sheet.getRange("H5").formulas[0][0], "=ROUND(E5-F5-G5,2)");
  assert.equal(sheet.getRange("J6").formulas[0][0], "=ROUND(H5*I6,2)");
  assert.equal(
    sheet.getRange("L6").formulas[0][0],
    "=ROUND((H5-J6)*K6+IF((H5-J6)*K6>=0,0.000000001,-0.000000001),2)",
  );
  assert.equal(sheet.getRange("M5").formulas[0][0], "=L6");
  assert.equal(sheet.getRange("M7").formulas[0][0], "=SUM(M5:M6)");
  assert.equal(sheet.getRange("E5:H5").format.numberFormat, "#,##0.00");
  assert.equal(sheet.getRange("J6").format.numberFormat, "#,##0.00");
  assert.equal(sheet.getRange("L6:M7").format.numberFormat, "#,##0.00");
  assert.equal(sheet.getRange("M5").format.numberFormat, "#,##0.00");
  assert.equal(formulas.some((formula) => /\[|\]|_xlfn|端游!/.test(formula)), false);

  const validation = await validateSettlementWorkbook(outputPath, row);
  assert.deepEqual(validation, {
    status: "PASS",
    formulaErrors: 0,
    externalFormulaLinks: 0,
    externalPackageLinks: 0,
    amountDelta: 0,
  });
  await assert.rejects(fs.access(`${outputPath}.inspect.ndjson`));
});

test("半分边界按十进制四舍五入，明日方舟最终金额为1897996.46", async () => {
  const batch = await loadCurrentBatch();
  const row = batch.ready.find((item) => item.normalizedGame === "明日方舟");
  assert.ok(row, "当前批次应包含明日方舟");
  const outputDir = path.resolve("test-output/half-cent");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "明日方舟 （端游）202607.xlsx");
  await writeSettlementWorkbook({ templatePath: TEMPLATE, row, outputPath });
  const validation = await validateSettlementWorkbook(outputPath, row);
  assert.equal(validation.status, "PASS");
  assert.equal(validation.amountDelta, 0);
});

test("汇总工作簿包含四张清单并记录白银之城基础筛选排除", async () => {
  const batch = await loadCurrentBatch();
  const outputDir = path.resolve("test-output/summary");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "端游结算单生成汇总_202607.xlsx");
  await writeSummaryWorkbook({
    batch,
    outputPath,
    metadata: {
      backendPath: BACKEND,
      companyPath: COMPANIES,
      templatePath: TEMPLATE,
      outputDir,
      runAt: "2026-08-20T12:00:00+08:00",
      sourceHashes: { backend: "a", companies: "b", template: "c" },
    },
  });

  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
  assert.deepEqual(
    workbook.worksheets.items.map((sheet) => sheet.name),
    ["生成清单", "排除清单", "异常清单", "运行信息"],
  );
  const excludedValues = workbook.worksheets.getItem("排除清单").getUsedRange(true).values;
  const whiteSilver = excludedValues.find((row) => row[1] === "白银之城（PC版）");
  assert.equal(whiteSilver[6], "基础筛选");
  assert.equal(whiteSilver[7], "收入金额<1");
  const anomalyValues = workbook.worksheets.getItem("异常清单").getUsedRange(true).values;
  assert.equal(anomalyValues[1][0], "无阻断异常");
  const infoValues = workbook.worksheets.getItem("运行信息").getUsedRange(true).values;
  const runAt = infoValues.find((row) => row[0] === "运行时间");
  assert.equal(runAt[1], "生成于 2026-08-20T12:00:00+08:00");
});
