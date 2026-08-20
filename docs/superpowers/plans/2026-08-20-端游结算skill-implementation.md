# 端游结算 Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可复用的 `pc-game-settlement` Codex Skill，根据后台财务对账明细、乙方公司信息表和控制模板，批量生成经逐条金额校验的端游结算单及汇总清单。

**Architecture:** 使用 Node.js ESM 与工作区内置 `@oai/artifact-tool`。纯业务规则与 Excel I/O 分离：规则模块负责筛选、人工排除、名称标准化、乙方匹配和分级金额复算；工作簿模块负责读取三类输入、复制模板、写入固定单元格、生成汇总表与渲染检查；CLI 只负责编排和输出结构化结果。所有异常先形成预检结果，阻断项只阻断受影响产品。

**Tech Stack:** Node.js 22+、内置 `node:test`、`@oai/artifact-tool` 2.8.6+、Codex Skill `SKILL.md`、PowerShell（本地安装与验收）。

---

## 文件结构

- Create: `.gitignore` — 忽略 `node_modules`、本地输入配置、测试输出和渲染缓存。
- Create: `package.json` — ESM 与测试命令。
- Create: `pc-game-settlement/SKILL.md` — Skill 触发条件、必需输入、执行流程和安全边界。
- Create: `pc-game-settlement/agents/openai.yaml` — UI 名称、简述和默认提示。
- Create: `pc-game-settlement/references/input-schema.md` — 三类输入字段、模板单元格和异常定义。
- Create: `pc-game-settlement/scripts/cli.mjs` — 命令行入口和参数解析。
- Create: `pc-game-settlement/scripts/lib/money.mjs` — 分级整数金额与费率计算。
- Create: `pc-game-settlement/scripts/lib/rules.mjs` — 筛选、人工排除、名称标准化、乙方匹配、金额核对。
- Create: `pc-game-settlement/scripts/lib/workbooks.mjs` — 输入工作簿导入、表头解析和模板写入。
- Create: `pc-game-settlement/scripts/lib/summary.mjs` — 四张汇总工作表生成与样式。
- Create: `pc-game-settlement/scripts/lib/validate.mjs` — 输出公式、外链、关键单元格、文件数量和渲染验证。
- Create: `pc-game-settlement/tests/money.test.mjs` — 金额舍入单测。
- Create: `pc-game-settlement/tests/rules.test.mjs` — 业务规则单测。
- Create: `pc-game-settlement/tests/workbooks.test.mjs` — 表头、乙方信息和模板映射单测。
- Create: `pc-game-settlement/tests/current-sample.test.mjs` — 当前三份样例的预检与端到端验收。
- Local only: `local/202607-exclusions.json` — 白银之城人工排除配置，不提交 Git。

### Task 1: 建立隔离执行环境与 Skill 骨架

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `pc-game-settlement/SKILL.md`
- Create: `pc-game-settlement/agents/openai.yaml`
- Create: `pc-game-settlement/references/input-schema.md`

- [ ] **Step 1: 使用 `superpowers:using-git-worktrees` 建立 `codex/pc-game-settlement` 隔离工作树**

工作树放在 `D:\Codex\结算自动化\端游结算Skill-worktrees\pc-game-settlement`，先确认主仓库 `git status --short` 为空。

- [ ] **Step 2: 初始化 Skill 骨架**

Run:

```powershell
& 'C:\Users\wuweixin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'C:\Users\wuweixin\.codex\skills\.system\skill-creator\scripts\init_skill.py' `
  pc-game-settlement --path . --resources scripts,references
```

Expected: 创建 `pc-game-settlement/SKILL.md`、`agents/openai.yaml`、`scripts/`、`references/`，无示例占位文件。

- [ ] **Step 3: 配置 ESM、测试命令与依赖连接**

`package.json`：

```json
{
  "name": "pc-game-settlement-skill",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test pc-game-settlement/tests/*.test.mjs"
  }
}
```

在工作树创建 `node_modules` 目录联接，目标为工作区依赖加载器返回的 Node packages 路径；`.gitignore` 至少包含：

```gitignore
node_modules/
local/
test-output/
qa-render/
```

- [ ] **Step 4: 先提交基础骨架**

```powershell
git add .gitignore package.json pc-game-settlement
git commit -m "chore: scaffold PC settlement skill"
```

### Task 2: 以失败测试定义金额和业务规则

**Files:**
- Create: `pc-game-settlement/tests/money.test.mjs`
- Create: `pc-game-settlement/tests/rules.test.mjs`
- Create: `pc-game-settlement/scripts/lib/money.mjs`
- Create: `pc-game-settlement/scripts/lib/rules.mjs`

- [ ] **Step 1: 写金额舍入失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { toCents, centsTimesDecimal, centsToNumber } from "../scripts/lib/money.mjs";

test("按分执行渠道费和分成的四舍五入", () => {
  assert.equal(toCents(1564684.06), 156468406n);
  assert.equal(centsTimesDecimal(156468406n, "0.05"), 7823420n);
  assert.equal(centsToNumber(centsTimesDecimal(148645 - 0n, "0.7")), 1040.52);
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `npm test -- --test-name-pattern="按分"`

Expected: FAIL，原因是 `money.mjs` 不存在。

- [ ] **Step 3: 实现金额函数**

采用 `BigInt` 表示分；十进制费率解析为分子/分母；正数使用半入舍入。导出：

```js
const tenPow = (places) => 10n ** BigInt(places);

function parseDecimal(value) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new TypeError(`非法十进制数：${text}`);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const denominator = tenPow(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  return { numerator: negative ? -numerator : numerator, denominator };
}

function roundDivideHalfAwayFromZero(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError("分母必须大于 0");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

export function toCents(value) {
  const { numerator, denominator } = parseDecimal(value);
  return roundDivideHalfAwayFromZero(numerator * 100n, denominator);
}

export function centsTimesDecimal(cents, decimal) {
  const { numerator, denominator } = parseDecimal(decimal);
  return roundDivideHalfAwayFromZero(cents * numerator, denominator);
}

export function centsToNumber(cents) {
  return Number(cents) / 100;
}
```

- [ ] **Step 4: 写业务规则失败测试**

覆盖以下可观察行为：

```js
assert.equal(normalizeGameName("崩坏：星穹铁道（PC版）"), "崩坏：星穹铁道");
assert.equal(passesBaseFilter({合同初审状态:"审核通过",合同复审状态:"审核通过",收入金额:0.1}), true);
assert.equal(passesBaseFilter({合同初审状态:"审核通过",合同复审状态:"电子签审核通过",收入金额:10}), false);
assert.equal(isExcluded(whiteSilverRow, exclusions).reason, "收入 0.1 元，经确认不结算");
assert.equal(resolveCompany("上海乐元素世界科技有限公司", companyMap).status, "missing");
```

再覆盖金额关系：对账金额、渠道费、结算基数、收入金额任一差异时返回实际值、复算值和差额。

- [ ] **Step 5: 运行并确认 RED，再实现规则模块**

`rules.mjs` 导出：`normalizeGameName`、`passesBaseFilter`、`buildExclusionKey`、`isExcluded`、`buildCompanyMap`、`resolveCompany`、`reconcileRow`、`prepareBatch`。

人工排除键必须是标准化后的 `月份|游戏名称|企业名称`，不能把 `0.1` 当作全局阈值；公司名只清理首尾、不可见与全角空格，不做模糊匹配。

- [ ] **Step 6: 运行全量单测并提交**

Run: `npm test`

Expected: money/rules tests 全部 PASS。

```powershell
git add pc-game-settlement/scripts/lib/money.mjs pc-game-settlement/scripts/lib/rules.mjs pc-game-settlement/tests
git commit -m "feat: add settlement filtering and reconciliation rules"
```

### Task 3: 读取三类工作簿并完成批次预检

**Files:**
- Create: `pc-game-settlement/scripts/lib/workbooks.mjs`
- Create: `pc-game-settlement/tests/workbooks.test.mjs`

- [ ] **Step 1: 写二维表解析失败测试**

测试后台缺列整批失败、公司表缺列整批失败、公司资料空值失败、重复不一致公司失败、完全一致重复去重并计数。

```js
assert.throws(() => parseBackendMatrix(matrixWithoutIncome), /缺少必需字段：收入金额/);
assert.deepEqual(parseCompanyMatrix(validCompanyMatrix).rows[0], {
  公司:"上海米哈游影铁科技有限公司",
  开户银行:"招商银行股份有限公司上海田林路支行",
  银行帐号:"121932974610601",
  联系人:"结算组",
  电话:"15316926375"
});
```

- [ ] **Step 2: 运行 RED 后实现导入与解析**

使用：

```js
const blob = await FileBlob.load(path);
const workbook = await SpreadsheetFile.importXlsx(blob);
const sheet = workbook.worksheets.getItemAt(0);
const matrix = sheet.getUsedRange(true).values;
```

银行帐号和电话立刻转为字符串。后台读取工作表名优先匹配“财务对账明细”，找不到时要求唯一非空工作表；公司表同理。

- [ ] **Step 3: 用当前样例只读预检**

创建 `local/202607-exclusions.json`：

```json
[
  {
    "month": "202607",
    "game": "白银之城",
    "company": "上海乐元素世界科技有限公司",
    "reason": "收入 0.1 元，经确认不结算"
  }
]
```

Expected JSON 统计：`baseEligible=18`、`manualExcluded=1`、`ready=17`、`matchedProducts=17`、`matchedCompanies=15`、`companyMissing=0`。

- [ ] **Step 4: 运行测试并提交**

```powershell
npm test
git add pc-game-settlement/scripts/lib/workbooks.mjs pc-game-settlement/tests/workbooks.test.mjs
git commit -m "feat: add workbook readers and batch preflight"
```

### Task 4: 从控制模板生成单产品结算单

**Files:**
- Modify: `pc-game-settlement/scripts/lib/workbooks.mjs`
- Create: `pc-game-settlement/tests/current-sample.test.mjs`

- [ ] **Step 1: 在首次工作簿写入前登记 artifact 操作**

Run exactly once in this session:

```powershell
node container_tools/mark_artifact_operation_started.mjs --operation-kind create --expected-output-count 18 --output-format xlsx
```

17 份产品结算单加 1 份批次汇总，共 18 个 `.xlsx`。

- [ ] **Step 2: 先渲染控制模板并保存 QA 图**

导入模板，渲染“对账单” `A1:M31` 到 `qa-render/template-before.png`，确认字体、合并单元格、边框、行列尺寸和打印内容完整。

- [ ] **Step 3: 写单产品失败测试**

用“原神”记录生成临时文件，重新导入并断言：

```js
assert.equal(values.A3, "TO 上海米哈游影铁科技有限公司");
assert.equal(values.C5, "原神");
assert.equal(values.D5, "付费下载");
assert.equal(values.B15, "公司名称：上海米哈游影铁科技有限公司");
assert.match(values.B17, /^银行帐号：\d+$/);
assert.equal(formulas.H5, "=ROUND(E5-F5-G5,2)");
assert.equal(formulas.J6, "=ROUND(H5*I6,2)");
assert.equal(formulas.L6, "=ROUND((H5-J6)*K6,2)");
assert.equal(formulas.M5, "=L6");
assert.equal(formulas.M7, "=SUM(M5:M6)");
```

并断言所有公式不包含 `[`、`]`、`_xlfn` 或外部工作簿名。

- [ ] **Step 4: 实现模板写入**

保留模板格式，仅写入：`A3`、`A5`、`C5:G5`、`H5`、`I6:L6`、`M5`、`M7`、`B15:B19`。A5 写入 `yyyy.mm.dd-yyyy.mm.dd` 文本，账号与电话写为文本格式 `@`。文件名为 `标准化游戏名称 （端游）YYYYMM.xlsx`。

- [ ] **Step 5: 导出、重新导入并验证单产品**

Expected: 无公式错误、无外链、最终金额与后台“收入金额”差异小于 `0.005` 元；渲染图与模板布局一致。

- [ ] **Step 6: 提交**

```powershell
git add pc-game-settlement/scripts/lib/workbooks.mjs pc-game-settlement/tests/current-sample.test.mjs
git commit -m "feat: generate settlement workbook from template"
```

### Task 5: 生成批次汇总清单和验证报告

**Files:**
- Create: `pc-game-settlement/scripts/lib/summary.mjs`
- Create: `pc-game-settlement/scripts/lib/validate.mjs`
- Modify: `pc-game-settlement/tests/current-sample.test.mjs`

- [ ] **Step 1: 写汇总失败测试**

断言四张工作表恰为：`生成清单`、`排除清单`、`异常清单`、`运行信息`。断言排除清单含 10 条基础筛选排除和 1 条人工排除；白银之城排除类型为“人工排除”，不得出现“乙方公司信息缺失”。

- [ ] **Step 2: 实现汇总工作簿**

使用 `Workbook.create()`；所有金额保留两位小数，表头统一深色填充和白字，冻结首行，按内容设置合理列宽；失败检查排在异常清单前部；运行信息记录三份输入路径、哈希、运行时间、月份、规则版本和输出目录。

- [ ] **Step 3: 实现输出验证器**

验证器重新导入每个输出并执行：关键单元格比对、公式扫描、错误值扫描、外链扫描、输出数量检查、源文件哈希前后比对。返回结构化 JSON：

```json
{"status":"PASS","productFiles":17,"summaryFiles":1,"formulaErrors":0,"externalLinks":0,"sourceHashesUnchanged":true}
```

- [ ] **Step 4: 运行测试并提交**

```powershell
npm test
git add pc-game-settlement/scripts/lib/summary.mjs pc-game-settlement/scripts/lib/validate.mjs pc-game-settlement/tests/current-sample.test.mjs
git commit -m "feat: add batch summary and output validation"
```

### Task 6: 完成 CLI 与 Skill 指令

**Files:**
- Create: `pc-game-settlement/scripts/cli.mjs`
- Modify: `pc-game-settlement/SKILL.md`
- Modify: `pc-game-settlement/agents/openai.yaml`
- Create: `pc-game-settlement/references/input-schema.md`

- [ ] **Step 1: 写 CLI 失败测试**

`--dry-run` 只输出预检 JSON，不生成文件；缺少任一必需参数时退出码为 2；存在批次级结构错误时退出码为 1；有单产品阻断但其余可生成时退出码为 0 并在汇总记录。

- [ ] **Step 2: 实现 CLI**

```text
node pc-game-settlement/scripts/cli.mjs \
  --backend <后台.xlsx> \
  --companies <公司信息.xlsx> \
  --template <模板.xlsx> \
  --output <目录> \
  --exclusions <人工排除.json> \
  [--dry-run]
```

CLI 在正式生成前打印月份、基础通过数、人工排除数、最终生成数、公司匹配数和异常数；不覆盖同名文件。

- [ ] **Step 3: 写精简 SKILL.md**

Frontmatter：

```yaml
---
name: pc-game-settlement
description: Use when generating monthly PC-game co-operation settlement statements from a backend reconciliation workbook, a CP company master workbook, and an approved settlement template.
---
```

正文使用中文，要求先读 `references/input-schema.md`，先 `--dry-run` 再经用户确认正式生成；明确精确合同状态、收入非零、人工排除、乙方精确匹配、税费非零阻断、逐条金额复算、不覆盖和不外发。

- [ ] **Step 4: 生成并检查 `agents/openai.yaml`**

使用 Skill Creator 的 `generate_openai_yaml.py`，设置：

```text
display_name=端游结算单批量生成
short_description=从后台明细和公司信息表生成端游结算单
default_prompt=请根据后台财务对账明细、乙方公司信息表和端游结算模板，先预检，再批量生成并逐份核对结算单。
```

- [ ] **Step 5: Skill 静态验证和测试**

```powershell
& 'C:\Users\wuweixin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'C:\Users\wuweixin\.codex\skills\.system\skill-creator\scripts\quick_validate.py' `
  '.\pc-game-settlement'
npm test
```

Expected: Skill validation PASS，所有代码测试 PASS，无未完成项或初始化占位文本。

- [ ] **Step 6: 提交**

```powershell
git add pc-game-settlement
git commit -m "feat: complete PC game settlement skill"
```

### Task 7: 当前样例端到端生成与视觉验收

**Files:**
- Local output: `D:\Codex\结算自动化\端游结算单\202607\`
- Local QA: `D:\Codex\结算自动化\端游结算Skill-worktrees\pc-game-settlement\qa-render\`

- [ ] **Step 1: 运行 dry-run**

```powershell
node pc-game-settlement/scripts/cli.mjs --backend 'C:\Users\wuweixin\Desktop\财务对账明细20260820.xlsx' --companies 'C:\Users\wuweixin\Desktop\联运端游公司信息列表.xlsx' --template 'C:\Users\wuweixin\Desktop\端游\崩坏：星穹铁道 （端游）202606.xlsx' --output 'D:\Codex\结算自动化\端游结算单\202607' --exclusions 'local\202607-exclusions.json' --dry-run
```

Expected: `18 / 1 / 17`，乙方缺失 `0`，阻断异常 `0`。

- [ ] **Step 2: 正式生成 18 个工作簿**

使用相同命令去掉 `--dry-run`。若目标目录已有同名文件，停止对应产品并报告，不覆盖。

- [ ] **Step 3: 运行机器验证**

Expected: 17 份产品结算单和 1 份汇总；17 份最终金额逐条等于后台收入金额；公式错误 0；外链 0；源文件哈希不变。

- [ ] **Step 4: 渲染并检查全部工作表**

渲染 17 份“对账单”和汇总的 4 张工作表。逐图检查：标题、TO公司、结算周期、游戏、金额、乙方五项资料、备注、甲方信息均可见，无截断、错位或异常空白；修复后重新运行全量验证。

- [ ] **Step 5: 更新测试期望并提交验收证据**

只提交测试与脚本，不提交用户源文件、生成的结算单或 QA PNG。

```powershell
git status --short
npm test
git log --oneline -8
```

### Task 8: 安装 Skill、合并分支并最终验收

**Files:**
- Install junction: `C:\Users\wuweixin\.codex\skills\pc-game-settlement` -> `D:\Codex\结算自动化\端游结算Skill\pc-game-settlement`

- [ ] **Step 1: 使用 `superpowers:finishing-a-development-branch` 完成分支**

在所有测试、样例生成和视觉验证通过后，将 `codex/pc-game-settlement` 合并回主仓库；不删除用户文件。

- [ ] **Step 2: 创建 Skill 目录联接**

确认目标路径不存在后再创建 Junction；若已存在且指向其他位置，停止并报告，不覆盖。

- [ ] **Step 3: 最终验证**

```powershell
git status --short
git log -1 --format='%H%n%s'
```

主仓库必须干净；重新运行 `quick_validate.py` 与 `npm test`；检查 `C:\Users\wuweixin\.codex\skills\pc-game-settlement\SKILL.md` 可读且实际解析到 D 盘仓库。

## 计划自检结论

- 设计中的筛选、白银之城人工排除、乙方精确匹配、税费阻断、逐条金额核对、模板保真、汇总清单、不覆盖和 D 盘输出均有对应任务。
- 端到端验收以当前三份样例为依据：基础通过18、人工排除1、最终生成17、乙方缺失0。
- 本次未授权子代理，因此执行时采用 `superpowers:executing-plans` 内联推进；Skill 行为验证使用真实样例、失败测试、dry-run 与输出重导入验证，不创建子代理。
