# 端游结算单金额千位分隔符 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让端游结算单全部金额以千位分隔符和两位小数显示，并按用户授权在原正式路径重生成202607批次。

**Architecture:** 保持现有金额数值、公式和模板布局不变，只在工作簿写入层设置 `#,##0.00`。用工作簿回归测试约束实际单元格格式，用文档测试约束 Skill 规则，再通过原批次全量生成、金额校验和渲染检查验证结果。

**Tech Stack:** Node.js ESM、`@oai/artifact-tool`、Node test runner、Excel `.xlsx`。

---

### Task 1: 用失败测试定义金额格式和 Skill 规则

**Files:**
- Modify: `pc-game-settlement/tests/current-sample.test.mjs`
- Modify: `pc-game-settlement/tests/cli.test.mjs`

- [ ] **Step 1: 添加产品结算单金额格式测试**

在“原神结算单替换外部引用并写入乙方资料”测试中加入：

```js
for (const address of ["E5:H5", "J6", "L6:M7"]) {
  assert.equal(sheet.getRange(address).format.numberFormat, "#,##0.00");
}
```

- [ ] **Step 2: 添加 Skill 文档规则测试**

在 `cli.test.mjs` 中读取 `SKILL.md` 和 `references/input-schema.md`，检查两者都包含 `#,##0.00`：

```js
test("Skill明确要求结算单金额使用千位分隔符", async () => {
  const [skill, schema] = await Promise.all([
    fs.readFile("pc-game-settlement/SKILL.md", "utf8"),
    fs.readFile("pc-game-settlement/references/input-schema.md", "utf8"),
  ]);
  assert.match(skill, /#,##0\.00/);
  assert.match(schema, /#,##0\.00/);
});
```

- [ ] **Step 3: 运行目标测试并确认失败**

Run:

```powershell
node --test --test-name-pattern="原神结算单|Skill明确" pc-game-settlement/tests/current-sample.test.mjs pc-game-settlement/tests/cli.test.mjs
```

Expected: FAIL，现有工作簿格式为 `0.00`，Skill 文档尚未包含 `#,##0.00`。

### Task 2: 实现金额格式并更新 Skill

**Files:**
- Modify: `pc-game-settlement/scripts/lib/workbooks.mjs`
- Modify: `pc-game-settlement/SKILL.md`
- Modify: `pc-game-settlement/references/input-schema.md`

- [ ] **Step 1: 修改工作簿金额格式**

将现有金额格式设置替换为：

```js
sheet.getRange("E5:H5").format.numberFormat = "#,##0.00";
sheet.getRange("J6").format.numberFormat = "#,##0.00";
sheet.getRange("L6:M7").format.numberFormat = "#,##0.00";
```

百分比格式 `I6`、`K6` 继续使用 `0.00%`。

- [ ] **Step 2: 更新 Skill 与映射参考**

在 `SKILL.md` 的不可改变控制中加入：

```markdown
- 产品结算单全部金额必须保持数值或公式，并使用 `#,##0.00` 显示千位分隔符和两位小数；不得转成文本。
```

在 `input-schema.md` 的模板规则后加入：

```markdown
金额单元格 `E5:H5`、`J6`、`L6:M7` 使用数字格式 `#,##0.00`；百分比单元格继续使用 `0.00%`。
```

- [ ] **Step 3: 运行目标测试并确认通过**

Run: Task 1 的目标测试命令。

Expected: PASS。

- [ ] **Step 4: 运行全部测试并提交**

Run: `node --test pc-game-settlement/tests/*.test.mjs`

Expected: 25 tests, 25 pass, 0 fail。

Commit:

```powershell
git add pc-game-settlement
git commit -m "feat: format settlement amounts with thousands separators"
```

### Task 3: 覆盖重生成并全量验收

**Files:**
- Replace: `D:\Codex\结算自动化\端游结算单\202607\*.xlsx`
- Preserve: `C:\Users\wuweixin\Desktop\财务对账明细20260820.xlsx`
- Preserve: `C:\Users\wuweixin\Desktop\联运端游公司信息列表.xlsx`
- Preserve: `C:\Users\wuweixin\Desktop\端游\崩坏：星穹铁道 （端游）202606.xlsx`

- [ ] **Step 1: 运行预检**

使用现有三个输入和 `local/202607-exclusions.json` 运行 CLI `--dry-run`。

Expected: 28条业务明细、18条基础通过、10条基础排除、1条人工排除、17条最终生成、0条阻断异常。

- [ ] **Step 2: 备份并重生成原正式路径**

确认备份目标不存在后，将当前 `202607` 目录移动到 `202607_before_thousands_separator_20260820`，然后向原 `202607` 路径生成。若生成失败，停止并将备份目录恢复为原正式路径。

Expected: 原正式路径重新出现，包含17份产品结算单和1份汇总表；无其他文件。

- [ ] **Step 3: 全量结构和金额验证**

逐份重新导入17份产品文件，检查：金额格式为 `#,##0.00`、最终金额差异为0、公式错误为0、公式外链为0、OOXML外链为0。检查三个源文件运行前后SHA256一致。

- [ ] **Step 4: 渲染大金额样例**

渲染“原神”“明日方舟”“鸣潮”的对账单，确认订单金额、渠道费、分成金额和最终结算金额均显示逗号，文字未截断、布局未改变。

- [ ] **Step 5: 校验 Skill 并提交运行说明**

Run: `quick_validate.py pc-game-settlement`

Expected: `Skill is valid!`。

确认 `master` 工作区干净，安装入口 `C:\Users\wuweixin\.codex\skills\pc-game-settlement` 仍指向 `D:\Codex\结算自动化\端游结算Skill\pc-game-settlement`。
