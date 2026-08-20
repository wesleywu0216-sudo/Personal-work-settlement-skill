import fs from "node:fs/promises";

import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import JSZip from "jszip";

import { normalizeText } from "./rules.mjs";

const FORMULA_ERROR = /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/;

function countErrors(matrix) {
  return matrix.flat().filter((value) => typeof value === "string" && FORMULA_ERROR.test(value)).length;
}

async function countExternalPackageLinks(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  return Object.keys(zip.files).filter((name) => name.startsWith("xl/externalLinks/") && !name.endsWith("/")).length;
}

export async function validateSettlementWorkbook(filePath, row) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
  const sheet = workbook.worksheets.getItem("对账单");
  const used = sheet.getRange("A1:M31");
  const values = used.values;
  const formulas = used.formulas.flat().filter(Boolean);
  const externalFormulaLinks = formulas.filter((formula) => /\[|\]|_xlfn|端游!/.test(formula)).length;
  const externalPackageLinks = await countExternalPackageLinks(filePath);
  const formulaErrors = countErrors(values);
  const amountDelta = Math.round((Number(sheet.getRange("M7").values[0][0]) - Number(row.收入金额)) * 100) / 100;
  const criticalMatches = [
    sheet.getRange("A3").values[0][0] === `TO ${normalizeText(row.企业名称)}`,
    sheet.getRange("C5").values[0][0] === row.normalizedGame,
    sheet.getRange("D5").values[0][0] === "付费下载",
    sheet.getRange("B15").values[0][0] === `公司名称：${row.companyInfo.公司}`,
    sheet.getRange("B16").values[0][0] === `开户银行：${row.companyInfo.开户银行}`,
    sheet.getRange("B17").values[0][0] === `银行帐号：${row.companyInfo.银行帐号}`,
    sheet.getRange("B18").values[0][0] === `联 系 人 ：${row.companyInfo.联系人}`,
    sheet.getRange("B19").values[0][0] === `电      话：${row.companyInfo.电话}`,
  ];
  const status =
    formulaErrors === 0 &&
    externalFormulaLinks === 0 &&
    externalPackageLinks === 0 &&
    Math.abs(amountDelta) < 0.005 &&
    criticalMatches.every(Boolean)
      ? "PASS"
      : "FAIL";
  return { status, formulaErrors, externalFormulaLinks, externalPackageLinks, amountDelta };
}
