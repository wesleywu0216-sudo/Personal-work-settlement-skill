import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCompanyMap,
  buildExclusionKey,
  isExcluded,
  normalizeGameName,
  passesBaseFilter,
  reconcileRow,
  resolveCompany,
} from "../scripts/lib/rules.mjs";

const whiteSilverRow = {
  月份: "202607",
  游戏名称: "白银之城（PC版）",
  企业名称: "上海乐元素世界科技有限公司",
  合同初审状态: "审核通过",
  合同复审状态: "审核通过",
  收入金额: 0.1,
};

test("游戏名称只移除末尾PC版标识", () => {
  assert.equal(normalizeGameName("崩坏：星穹铁道（PC版）"), "崩坏：星穹铁道");
  assert.equal(normalizeGameName("鸣潮(PC版)"), "鸣潮");
  assert.equal(normalizeGameName("PC版传奇"), "PC版传奇");
});

test("基础筛选要求两个合同状态精确通过且收入非零", () => {
  assert.equal(passesBaseFilter(whiteSilverRow), true);
  assert.equal(
    passesBaseFilter({ ...whiteSilverRow, 合同复审状态: "电子签审核通过" }),
    false,
  );
  assert.equal(passesBaseFilter({ ...whiteSilverRow, 收入金额: 0 }), false);
});

test("人工排除按月份标准游戏名和企业精确命中", () => {
  const exclusions = [
    {
      month: "202607",
      game: "白银之城",
      company: "上海乐元素世界科技有限公司",
      reason: "收入 0.1 元，经确认不结算",
    },
  ];
  assert.equal(
    buildExclusionKey(whiteSilverRow),
    "202607|白银之城|上海乐元素世界科技有限公司",
  );
  assert.deepEqual(isExcluded(whiteSilverRow, exclusions), {
    excluded: true,
    reason: "收入 0.1 元，经确认不结算",
  });
  assert.equal(
    isExcluded({ ...whiteSilverRow, 游戏名称: "其他游戏（PC版）" }, exclusions).excluded,
    false,
  );
});

test("人工排除统一识别YYYY-MM与YYYYMM月份", () => {
  const result = isExcluded(
    { ...whiteSilverRow, 月份: "2026-07" },
    [
      {
        month: "202607",
        game: "白银之城",
        company: "上海乐元素世界科技有限公司",
        reason: "收入 0.1 元，经确认不结算",
      },
    ],
  );
  assert.equal(result.excluded, true);
});

test("公司资料精确匹配且完全相同重复可去重", () => {
  const company = {
    公司: "上海米哈游影铁科技有限公司",
    开户银行: "招商银行股份有限公司上海田林路支行",
    银行帐号: "121932974610601",
    联系人: "结算组",
    电话: "15316926375",
  };
  const result = buildCompanyMap([company, { ...company }]);
  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(
    resolveCompany(" 上海米哈游影铁科技有限公司　", result),
    { status: "matched", row: company },
  );
  assert.deepEqual(resolveCompany("上海米哈游科技有限公司", result), {
    status: "missing",
    missingFields: ["公司", "开户银行", "银行帐号", "联系人", "电话"],
  });
});

test("同公司不一致资料被标记为冲突", () => {
  const result = buildCompanyMap([
    { 公司: "A公司", 开户银行: "甲行", 银行帐号: "001", 联系人: "甲", 电话: "100" },
    { 公司: "A公司", 开户银行: "乙行", 银行帐号: "001", 联系人: "甲", 电话: "100" },
  ]);
  assert.deepEqual(resolveCompany("A公司", result), {
    status: "conflict",
    missingFields: [],
  });
});

test("逐条金额复算返回每一项检查结果", () => {
  const valid = {
    流水总计: 100,
    非结算金额: 10,
    退款金额: 5,
    对账金额: 85,
    渠道费率: 0.05,
    渠道费: 4.25,
    税费: 0,
    结算基数: 80.75,
    比例: 0.7,
    收入金额: 56.53,
  };
  const pass = reconcileRow(valid);
  assert.equal(pass.ok, true);
  assert.deepEqual(pass.computed, {
    对账金额: 85,
    渠道费: 4.25,
    结算基数: 80.75,
    收入金额: 56.53,
  });

  const fail = reconcileRow({ ...valid, 收入金额: 56.52 });
  assert.equal(fail.ok, false);
  assert.deepEqual(fail.failures, [
    { field: "收入金额", actual: 56.52, expected: 56.53, delta: -0.01 },
  ]);
});

test("税费非零单独阻断", () => {
  const result = reconcileRow({
    流水总计: 100,
    非结算金额: 0,
    退款金额: 0,
    对账金额: 100,
    渠道费率: 0,
    渠道费: 0,
    税费: 1,
    结算基数: 99,
    比例: 1,
    收入金额: 99,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].field, "税费");
});
