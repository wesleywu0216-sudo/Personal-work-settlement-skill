import test from "node:test";
import assert from "node:assert/strict";

import { prepareBatch } from "../scripts/lib/rules.mjs";
import {
  BACKEND_REQUIRED_FIELDS,
  parseBackendMatrix,
  parseCompanyMatrix,
} from "../scripts/lib/workbooks.mjs";

function matrixFromRecords(headers, records) {
  return [headers, ...records.map((record) => headers.map((header) => record[header] ?? null))];
}

const validBackendRow = {
  对账单ID: "id-1",
  游戏名称: "原神",
  企业名称: "上海米哈游影铁科技有限公司",
  月份: "2026-07",
  结算周期: "2026-07-01~2026-07-31",
  流水总计: "100.00",
  非结算金额: "10.00",
  退款金额: "5.00",
  对账金额: "85.00",
  渠道费率: 0.05,
  渠道费: "4.25",
  税率: 0,
  税费: "0.00",
  结算基数: "80.75",
  比例: 0.7,
  收入金额: "56.53",
  合同开始时间: "2024-01-01",
  合同终止时间: "2028-01-01",
  合同初审状态: "审核通过",
  合同复审状态: "审核通过",
};

test("后台矩阵缺少必需字段时整批失败", () => {
  const headers = BACKEND_REQUIRED_FIELDS.filter((field) => field !== "收入金额");
  assert.throws(
    () => parseBackendMatrix(matrixFromRecords(headers, [validBackendRow])),
    /缺少必需字段：收入金额/,
  );
});

test("后台矩阵解析百分比、金额和源行号", () => {
  const sourceWithPercentText = {
    ...validBackendRow,
    渠道费率: "5.00%",
    税率: "0.00%",
    比例: "70.00%",
  };
  const result = parseBackendMatrix(
    matrixFromRecords(BACKEND_REQUIRED_FIELDS, [sourceWithPercentText]),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].渠道费率, 0.05);
  assert.equal(result.rows[0].比例, 0.7);
  assert.equal(result.rows[0].收入金额, 56.53);
  assert.equal(result.rows[0]._sourceRow, 2);
});

test("后台末尾总计行不作为业务明细解析", () => {
  const totalRow = {
    游戏名称: "总计",
    流水总计: "45079351.32",
    非结算金额: "0.00",
    退款金额: "0.00",
    对账金额: "45079351.32",
    渠道费: "2253967.56",
    税费: "131.01",
    结算基数: "42825252.75",
    收入金额: "28179920.84",
  };
  const result = parseBackendMatrix(
    matrixFromRecords(BACKEND_REQUIRED_FIELDS, [validBackendRow, totalRow]),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].对账单ID, "id-1");
});

test("公司矩阵把帐号和电话作为文本", () => {
  const result = parseCompanyMatrix([
    ["公司", "开户银行", "银行帐号", "联系人", "电话"],
    ["A公司", "甲行", "001234", "甲", 13800138000],
  ]);
  assert.deepEqual(result.rows[0], {
    公司: "A公司",
    开户银行: "甲行",
    银行帐号: "001234",
    联系人: "甲",
    电话: "13800138000",
    _sourceRow: 2,
  });
});

test("超出安全整数的数字银行帐号被拒绝", () => {
  assert.throws(
    () =>
      parseCompanyMatrix([
        ["公司", "开户银行", "银行帐号", "联系人", "电话"],
        ["A公司", "甲行", 12193297461060100, "甲", "13800138000"],
      ]),
    /银行帐号.*必须在源表中保存为文本/,
  );
});

test("人工排除先于乙方匹配，因此白银之城不触发公司缺失", () => {
  const whiteSilver = {
    ...validBackendRow,
    对账单ID: "id-white",
    游戏名称: "白银之城（PC版）",
    企业名称: "上海乐元素世界科技有限公司",
    流水总计: 0.1,
    非结算金额: 0,
    退款金额: 0,
    对账金额: 0.1,
    渠道费率: 0,
    渠道费: 0,
    税费: 0,
    结算基数: 0.1,
    比例: 1,
    收入金额: 0.1,
  };
  const companyRows = [
    {
      公司: "上海米哈游影铁科技有限公司",
      开户银行: "招商银行股份有限公司上海田林路支行",
      银行帐号: "121932974610601",
      联系人: "结算组",
      电话: "15316926375",
    },
  ];
  const result = prepareBatch(
    [whiteSilver, validBackendRow],
    companyRows,
    [
      {
        month: "202607",
        game: "白银之城",
        company: "上海乐元素世界科技有限公司",
        reason: "收入 0.1 元，经确认不结算",
      },
    ],
  );
  assert.deepEqual(result.stats, {
    totalRows: 2,
    baseEligible: 2,
    baseExcluded: 0,
    manualExcluded: 1,
    ready: 1,
    matchedProducts: 1,
    matchedCompanies: 1,
    companyMissing: 0,
    blockingAnomalies: 0,
  });
  assert.equal(result.excluded[0].type, "人工排除");
  assert.equal(result.ready[0].normalizedGame, "原神");
});
