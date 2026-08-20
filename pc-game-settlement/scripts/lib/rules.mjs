import { centsTimesDecimal, centsToNumber, toCents } from "./money.mjs";

export const COMPANY_FIELDS = ["公司", "开户银行", "银行帐号", "联系人", "电话"];

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u3000/g, " ")
    .trim();
}

export function normalizeGameName(value) {
  return normalizeText(value).replace(/\s*[（(]PC版[）)]\s*$/i, "");
}

export function normalizeMonth(value) {
  const text = normalizeText(value);
  const match = /^(\d{4})[-/]?(\d{2})$/.exec(text);
  return match ? `${match[1]}${match[2]}` : text;
}

export function isPositiveApprovalStatus(value) {
  const text = normalizeText(value);
  return text.includes("通过") && !text.includes("不通过");
}

export function passesBaseFilter(row) {
  return (
    isPositiveApprovalStatus(row.合同初审状态) &&
    isPositiveApprovalStatus(row.合同复审状态) &&
    toCents(row.收入金额) >= 100n
  );
}

export function baseFilterReasons(row) {
  const reasons = [];
  if (!isPositiveApprovalStatus(row.合同初审状态)) {
    reasons.push(`合同初审状态=${normalizeText(row.合同初审状态) || "空"}`);
  }
  if (!isPositiveApprovalStatus(row.合同复审状态)) {
    reasons.push(`合同复审状态=${normalizeText(row.合同复审状态) || "空"}`);
  }
  if (toCents(row.收入金额) < 100n) {
    reasons.push("收入金额<1");
  }
  return reasons;
}

function exclusionParts(value) {
  return {
    month: normalizeMonth(value.month ?? value.月份),
    game: normalizeGameName(value.game ?? value.游戏名称),
    company: normalizeText(value.company ?? value.企业名称),
  };
}

export function buildExclusionKey(value) {
  const { month, game, company } = exclusionParts(value);
  return `${month}|${game}|${company}`;
}

export function isExcluded(row, exclusions = []) {
  const key = buildExclusionKey(row);
  const match = exclusions.find((item) => buildExclusionKey(item) === key);
  return match
    ? { excluded: true, reason: normalizeText(match.reason) }
    : { excluded: false, reason: "" };
}

function sanitizeCompany(row) {
  return Object.fromEntries(COMPANY_FIELDS.map((field) => [field, normalizeText(row[field])]));
}

function sameCompany(left, right) {
  return COMPANY_FIELDS.every((field) => left[field] === right[field]);
}

export function buildCompanyMap(rows) {
  const map = new Map();
  const incomplete = new Map();
  const conflicts = new Set();
  let duplicateCount = 0;

  for (const rawRow of rows) {
    const row = sanitizeCompany(rawRow);
    const key = row.公司;
    const missingFields = COMPANY_FIELDS.filter((field) => !row[field]);
    if (missingFields.length > 0) {
      incomplete.set(key, missingFields);
      continue;
    }
    if (!map.has(key)) {
      map.set(key, row);
      continue;
    }
    if (sameCompany(map.get(key), row)) {
      duplicateCount += 1;
    } else {
      conflicts.add(key);
    }
  }

  return { map, incomplete, conflicts, duplicateCount };
}

export function resolveCompany(companyName, companyMap) {
  const key = normalizeText(companyName);
  if (companyMap.conflicts.has(key)) {
    return { status: "conflict", missingFields: [] };
  }
  if (companyMap.incomplete.has(key)) {
    return { status: "incomplete", missingFields: companyMap.incomplete.get(key) };
  }
  if (companyMap.map.has(key)) {
    return { status: "matched", row: companyMap.map.get(key) };
  }
  return { status: "missing", missingFields: [...COMPANY_FIELDS] };
}

function difference(field, actualCents, expectedCents) {
  return {
    field,
    actual: centsToNumber(actualCents),
    expected: centsToNumber(expectedCents),
    delta: centsToNumber(actualCents - expectedCents),
  };
}

export function reconcileRow(row) {
  const flow = toCents(row.流水总计);
  const nonSettlement = toCents(row.非结算金额);
  const refund = toCents(row.退款金额);
  const actualReconciled = toCents(row.对账金额);
  const actualChannelFee = toCents(row.渠道费);
  const actualTax = toCents(row.税费);
  const actualBase = toCents(row.结算基数);
  const actualIncome = toCents(row.收入金额);

  const expectedReconciled = flow - nonSettlement - refund;
  const expectedChannelFee = centsTimesDecimal(expectedReconciled, row.渠道费率);
  const expectedBase = expectedReconciled - expectedChannelFee;
  const expectedIncome = centsTimesDecimal(expectedBase, row.比例);

  const failures = [];
  if (actualReconciled !== expectedReconciled) {
    failures.push(difference("对账金额", actualReconciled, expectedReconciled));
  }
  if (actualChannelFee !== expectedChannelFee) {
    failures.push(difference("渠道费", actualChannelFee, expectedChannelFee));
  }
  if (actualTax !== 0n) {
    failures.push(difference("税费", actualTax, 0n));
  }
  if (actualBase !== expectedBase) {
    failures.push(difference("结算基数", actualBase, expectedBase));
  }
  if (actualIncome !== expectedIncome) {
    failures.push(difference("收入金额", actualIncome, expectedIncome));
  }

  return {
    ok: failures.length === 0,
    computed: {
      对账金额: centsToNumber(expectedReconciled),
      渠道费: centsToNumber(expectedChannelFee),
      结算基数: centsToNumber(expectedBase),
      收入金额: centsToNumber(expectedIncome),
    },
    failures,
  };
}

export function prepareBatch(rows, companyRows, exclusions = []) {
  const companyMap = buildCompanyMap(companyRows);
  const excluded = [];
  const anomalies = [];
  const candidates = [];
  let baseEligible = 0;
  let manualExcluded = 0;

  for (const row of rows) {
    const reasons = baseFilterReasons(row);
    if (reasons.length > 0) {
      excluded.push({ row, type: "基础筛选", reason: reasons.join("；") });
      continue;
    }
    baseEligible += 1;
    const manual = isExcluded(row, exclusions);
    if (manual.excluded) {
      manualExcluded += 1;
      excluded.push({ row, type: "人工排除", reason: manual.reason });
      continue;
    }
    candidates.push(row);
  }

  const groups = new Map();
  for (const row of candidates) {
    const key = buildExclusionKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicateKeys = new Set();
  for (const [key, group] of groups) {
    if (group.length > 1) {
      duplicateKeys.add(key);
      for (const row of group) {
        anomalies.push({ row, type: "重复产品记录", details: `同组共有${group.length}条记录` });
      }
    }
  }

  const ready = [];
  const matchedCompanyNames = new Set();
  let matchedProducts = 0;
  let companyMissing = 0;

  for (const row of candidates) {
    if (duplicateKeys.has(buildExclusionKey(row))) continue;
    const company = resolveCompany(row.企业名称, companyMap);
    if (company.status !== "matched") {
      companyMissing += 1;
      anomalies.push({
        row,
        type: "乙方公司信息缺失",
        details: `${company.status}：${company.missingFields.join("、")}`,
      });
      continue;
    }
    matchedProducts += 1;
    matchedCompanyNames.add(normalizeText(row.企业名称));
    const reconciliation = reconcileRow(row);
    if (!reconciliation.ok) {
      anomalies.push({ row, type: "金额核对失败", details: reconciliation.failures });
      continue;
    }
    ready.push({
      ...row,
      normalizedGame: normalizeGameName(row.游戏名称),
      monthKey: normalizeMonth(row.月份),
      companyInfo: company.row,
      reconciliation,
    });
  }

  return {
    ready,
    excluded,
    anomalies,
    stats: {
      totalRows: rows.length,
      baseEligible,
      baseExcluded: rows.length - baseEligible,
      manualExcluded,
      ready: ready.length,
      matchedProducts,
      matchedCompanies: matchedCompanyNames.size,
      companyMissing,
      blockingAnomalies: anomalies.length,
    },
    companyDuplicateCount: companyMap.duplicateCount,
  };
}
