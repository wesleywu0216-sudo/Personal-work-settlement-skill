import test from "node:test";
import assert from "node:assert/strict";

import {
  centsTimesDecimal,
  centsToNumber,
  toCents,
} from "../scripts/lib/money.mjs";

test("金额转换保持到分", () => {
  assert.equal(toCents("1564684.06"), 156468406n);
  assert.equal(toCents(0.1), 10n);
  assert.equal(centsToNumber(104052n), 1040.52);
});

test("渠道费按分四舍五入", () => {
  assert.equal(centsTimesDecimal(156468406n, "0.05"), 7823420n);
});

test("正负金额均采用四舍五入到分", () => {
  assert.equal(centsTimesDecimal(1n, "0.5"), 1n);
  assert.equal(centsTimesDecimal(-1n, "0.5"), -1n);
});

test("非法十进制数被拒绝", () => {
  assert.throws(() => toCents("1,000.00"), /非法十进制数/);
});

