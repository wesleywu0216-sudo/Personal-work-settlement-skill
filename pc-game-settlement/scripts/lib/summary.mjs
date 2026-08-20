import fs from "node:fs/promises";
import path from "node:path";

import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

function outputFileName(row) {
  return `${row.normalizedGame} （端游）${row.monthKey}.xlsx`;
}

function stringifyDetails(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function addDataSheet(workbook, name, headers, rows, widths) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length > 0) {
    sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  }
  const used = sheet.getRangeByIndexes(0, 0, Math.max(rows.length + 1, 2), headers.length);
  used.format.font = { name: "Microsoft YaHei", size: 10 };
  used.format.verticalAlignment = "center";
  const header = sheet.getRangeByIndexes(0, 0, 1, headers.length);
  header.format = {
    fill: "#44546A",
    font: { name: "Microsoft YaHei", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#B4C6E7" },
  };
  header.format.rowHeight = 26;
  sheet.freezePanes.freezeRows(1);
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, Math.max(rows.length + 1, 2), 1).format.columnWidth = width;
  });
  if (rows.length > 0) {
    sheet.getRangeByIndexes(1, 0, rows.length, headers.length).format.wrapText = true;
  }
  return sheet;
}

export async function writeSummaryWorkbook({ batch, outputPath, metadata }) {
  const workbook = Workbook.create();
  const generatedRows = batch.ready.map((row) => [
    row._sourceRow,
    row.游戏名称,
    row.企业名称,
    row.monthKey,
    row.收入金额,
    outputFileName(row),
    "已匹配",
    "核对通过",
  ]);
  const generated = addDataSheet(
    workbook,
    "生成清单",
    ["原始行号", "游戏名称", "企业名称", "月份", "收入金额", "输出文件名", "乙方资料", "核对状态"],
    generatedRows,
    [10, 28, 34, 12, 16, 36, 14, 14],
  );
  if (generatedRows.length > 0) generated.getRange(`E2:E${generatedRows.length + 1}`).format.numberFormat = "#,##0.00";

  const excludedRows = batch.excluded.map(({ row, type, reason }) => [
    row._sourceRow,
    row.游戏名称,
    row.企业名称,
    row.收入金额,
    row.合同初审状态,
    row.合同复审状态,
    type,
    reason,
  ]);
  const excluded = addDataSheet(
    workbook,
    "排除清单",
    ["原始行号", "游戏名称", "企业名称", "收入金额", "合同初审状态", "合同复审状态", "排除类型", "排除原因"],
    excludedRows,
    [10, 28, 34, 16, 18, 20, 16, 42],
  );
  if (excludedRows.length > 0) excluded.getRange(`D2:D${excludedRows.length + 1}`).format.numberFormat = "#,##0.00";

  const anomalyRows = batch.anomalies.length > 0
    ? batch.anomalies.map(({ row, type, details }) => [type, row._sourceRow, row.游戏名称, row.企业名称, stringifyDetails(details)])
    : [["无阻断异常", null, null, null, null]];
  addDataSheet(
    workbook,
    "异常清单",
    ["状态/异常类型", "原始行号", "游戏名称", "企业名称", "详情"],
    anomalyRows,
    [20, 10, 28, 34, 70],
  );

  const infoRows = [
    ["后台明细", metadata.backendPath],
    ["乙方公司信息表", metadata.companyPath],
    ["结算单模板", metadata.templatePath],
    ["输出目录", metadata.outputDir],
    ["运行时间", metadata.runAt],
    ["月份", batch.ready[0]?.monthKey ?? ""],
    ["业务明细数", batch.stats.totalRows],
    ["基础通过数", batch.stats.baseEligible],
    ["基础排除数", batch.stats.baseExcluded],
    ["人工排除数", batch.stats.manualExcluded],
    ["最终生成数", batch.stats.ready],
    ["乙方匹配公司数", batch.stats.matchedCompanies],
    ["阻断异常数", batch.stats.blockingAnomalies],
    ["后台明细SHA256", metadata.sourceHashes.backend],
    ["公司信息表SHA256", metadata.sourceHashes.companies],
    ["模板SHA256", metadata.sourceHashes.template],
    ["规则版本", "pc-game-settlement/v1"],
  ];
  addDataSheet(workbook, "运行信息", ["项目", "值"], infoRows, [24, 100]);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(outputPath);
  return { workbook, outputPath };
}

