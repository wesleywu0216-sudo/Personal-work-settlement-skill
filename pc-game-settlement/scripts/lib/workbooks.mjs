import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

import { normalizeText } from "./rules.mjs";

export const BACKEND_REQUIRED_FIELDS = [
  "对账单ID",
  "游戏名称",
  "企业名称",
  "月份",
  "结算周期",
  "流水总计",
  "非结算金额",
  "退款金额",
  "对账金额",
  "渠道费率",
  "渠道费",
  "税率",
  "税费",
  "结算基数",
  "比例",
  "收入金额",
  "合同开始时间",
  "合同终止时间",
  "合同初审状态",
  "合同复审状态",
];

export const COMPANY_REQUIRED_FIELDS = ["公司", "开户银行", "银行帐号", "联系人", "电话"];

const MONEY_FIELDS = [
  "流水总计",
  "非结算金额",
  "退款金额",
  "对账金额",
  "渠道费",
  "税费",
  "结算基数",
  "收入金额",
];

const PERCENT_FIELDS = ["渠道费率", "税率", "比例"];

function isBlank(value) {
  return value === null || value === undefined || normalizeText(value) === "";
}

function headerIndex(matrix, requiredFields, sourceLabel) {
  if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0])) {
    throw new Error(`${sourceLabel}没有可读取的表头`);
  }
  const headers = matrix[0].map(normalizeText);
  const missing = requiredFields.filter((field) => !headers.includes(field));
  if (missing.length > 0) {
    throw new Error(`${sourceLabel}缺少必需字段：${missing.join("、")}`);
  }
  return { index: new Map(headers.map((header, position) => [header, position])) };
}

function parseNumber(value, field, sourceRow) {
  if (isBlank(value)) {
    throw new Error(`第${sourceRow}行“${field}”为空`);
  }
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw new Error(`第${sourceRow}行“${field}”不是合法数字：${text}`);
  }
  const number = Number(text);
  if (!Number.isFinite(number)) {
    throw new Error(`第${sourceRow}行“${field}”超出可处理范围`);
  }
  return number;
}

function parsePercent(value, field, sourceRow) {
  if (typeof value === "string" && value.trim().endsWith("%")) {
    return parseNumber(value.trim().slice(0, -1), field, sourceRow) / 100;
  }
  return parseNumber(value, field, sourceRow);
}

function nonEmptyRows(matrix) {
  return matrix.slice(1).filter((row) => Array.isArray(row) && row.some((value) => !isBlank(value)));
}

export function parseBackendMatrix(matrix) {
  const { index } = headerIndex(matrix, BACKEND_REQUIRED_FIELDS, "后台明细");
  const sources = matrix
    .slice(1)
    .map((source, offset) => ({ source, sourceRow: offset + 2 }))
    .filter(({ source }) => Array.isArray(source) && source.some((value) => !isBlank(value)))
    .filter(({ source, sourceRow }) => {
      const statementId = source[index.get("对账单ID")];
      const game = normalizeText(source[index.get("游戏名称")]);
      if (!isBlank(statementId)) return true;
      if (game === "总计") return false;
      throw new Error(`第${sourceRow}行“对账单ID”为空且不是总计行`);
    });
  const rows = sources.map(({ source, sourceRow }) => {
    const row = Object.fromEntries(
      BACKEND_REQUIRED_FIELDS.map((field) => [field, source[index.get(field)] ?? null]),
    );
    for (const field of MONEY_FIELDS) {
      row[field] = parseNumber(row[field], field, sourceRow);
    }
    for (const field of PERCENT_FIELDS) {
      row[field] = parsePercent(row[field], field, sourceRow);
    }
    row._sourceRow = sourceRow;
    return row;
  });
  return { rows };
}

function identifierToText(value, field, sourceRow) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(`第${sourceRow}行“${field}”必须在源表中保存为文本`);
  }
  return normalizeText(value);
}

export function parseCompanyMatrix(matrix) {
  const { index } = headerIndex(matrix, COMPANY_REQUIRED_FIELDS, "公司信息表");
  const rows = nonEmptyRows(matrix).map((source, offset) => {
    const sourceRow = offset + 2;
    return {
      公司: normalizeText(source[index.get("公司")]),
      开户银行: normalizeText(source[index.get("开户银行")]),
      银行帐号: identifierToText(source[index.get("银行帐号")], "银行帐号", sourceRow),
      联系人: normalizeText(source[index.get("联系人")]),
      电话: identifierToText(source[index.get("电话")], "电话", sourceRow),
      _sourceRow: sourceRow,
    };
  });
  return { rows };
}

function chooseWorksheet(workbook, preferredName) {
  const sheets = workbook.worksheets.items;
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("工作簿没有工作表");
  }
  return sheets.find((sheet) => sheet.name === preferredName) ?? sheets[0];
}

export async function readWorkbookMatrix(filePath, preferredSheetName) {
  const blob = await FileBlob.load(filePath);
  const workbook = await SpreadsheetFile.importXlsx(blob);
  const sheet = chooseWorksheet(workbook, preferredSheetName);
  const usedRange = sheet.getUsedRange(true);
  if (!usedRange) {
    throw new Error(`工作表“${sheet.name}”没有数据`);
  }
  return { workbook, sheet, matrix: usedRange.values };
}

export async function readBackendWorkbook(filePath) {
  const loaded = await readWorkbookMatrix(filePath, "财务对账明细");
  return { ...loaded, ...parseBackendMatrix(loaded.matrix) };
}

export async function readCompanyWorkbook(filePath) {
  const loaded = await readWorkbookMatrix(filePath, "Sheet1");
  return { ...loaded, ...parseCompanyMatrix(loaded.matrix) };
}
