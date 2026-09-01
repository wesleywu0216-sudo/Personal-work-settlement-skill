---
name: researching-us-stocks
description: Use when a user requests long-term research on a listed U.S. company, sector-specific due diligence, valuation context, entry timing, or investment risk review.
---

# Researching U.S. Stocks

Treat the company and its industry as the research subjects and hard gates. Macro, valuation, technical state, and risk assessments support—not replace—that judgment.

## Route the request

- Obtain a company name or ticker and an optional as-of date. If a reliable source uniquely resolves the ticker to one supported U.S.-listed common stock, verify and record the exchange yourself; ask the user only when the identity, listing, or share class remains ambiguous.
- Read [references/research-workflow.md](references/research-workflow.md) once before taking research action.
- Default to a **rapid health check**. Continue to full deep research only when the user requested deep research and every company and industry gate passes; an all-pass health check still ends with a deep-research eligibility decision rather than silently expanding scope.
- `无法评估` is a separate process state, not an investment-research label. Use it when identity or minimum critical evidence cannot be verified; output only the stop reason, verified evidence, missing items, and next step.

## Non-negotiable rules

- **输出顺序硬门禁**：快速体检与深度研究都必须先输出证券身份和研究 `as-of`，随后按模板完整输出 C1-C8 与 I1-I8 共 16 行原子门槛；只有第 16 行门槛已经完成后，正文才可首次出现任何五档标签、四卡结果汇总或执行摘要。禁止以“结论先行”“先说结论”“研究结论”等标题或句式开场，也禁止在门槛表前用“偏积极”“暂不介入”等同义表达暗示标签。身份或最低关键证据不足、因而无法完成可靠门槛判断时，直接使用模板 A，不绕过顺序门禁。
- **固定 schema 硬门禁**：快速体检、深研、四卡、风险矩阵与证据账本必须逐列使用 [references/report-templates.md](references/report-templates.md) 的表头；不得压缩、合并、改名或删除任何强制列。评分结果术语只允许`正式分 / 暂定分 / 不评分`，置信度只允许`High / Medium / Low`，风险概率与影响只允许`Low / Med / High`。`不评分`必须单独书写，禁止附`/100`或任何数字。
- **证据与时点硬门禁**：证据账本每行只能是一项原子主张，类型只允许`事实 / 公司口径 / 外部估计 / 分析推断`，状态只允许`confirmed / conflicted / unverified`，访问时间必须包含日期、时间和时区。技术卡的标的与基准必须来自同一数据源、同一截止日和一致复权口径；不满足时相关分项不计覆盖率，关键输入不满足时整卡`不评分`。
- Evaluate every atomic company and industry gate separately. A failed gate cannot be offset by macro conditions, low valuation, technical strength, or another score.
- Supplemental research may resolve an unknown gate. Before it is resolved, do not issue a positive label or a deep-research conclusion.
- Report **macro environment**, **valuation attractiveness**, **technical state**, and **risk controllability** as independent 0–100 cards only when their evidence is sufficient. Never combine them into a total score.
- Keep valuation and technical analysis separate. Technical state may inform entry timing only.
- Current or latest price, valuation, or technical values require a source actually opened in this run. If unavailable, disclose the tool limit, omit the current value and affected score, and do not issue a positive label.
- The only investment-research labels are `回避`, `观察`, `值得跟踪`, `等待价格`, and `可考虑介入`. They describe the security's research status, not personalized buy/sell, position size, or suitability advice.
- End completed research with falsifiers, tracking indicators, as-of date, sources, and a general-research disclaimer.
- Before sending, silently confirm the fixed table headers, 16 gate rows, card coverage math, technical-data alignment, controlled evidence vocabulary, and exactly one five-level research label.

## Security and industry routing

This skill applies to U.S.-listed common stocks, including ADRs and ordinary share classes after their rights are distinguished. Stop after identity confirmation for ETFs, ETNs, closed-end funds, warrants, preferred stocks, pre-merger SPACs, or other unsupported types, and recommend a dedicated research workflow.

For supported securities, classify the primary earnings engine: general operating company, bank/insurer, biotech/pharma, commodity/cyclical, REIT, or multi-business company. Treat material segments separately when one label would hide different economics.

## Read references only when needed

- Before assigning scores, read [references/scorecards.md](references/scorecards.md) for fixed components, anchors, and per-card confidence.
- After industry classification, read [references/industry-adapters.md](references/industry-adapters.md) for applicable metrics and valuation models.
- When collecting or reconciling evidence, read [references/evidence-sources.md](references/evidence-sources.md) for source priority and freshness rules.
- Before drafting a completed health check or deep report, read [references/report-templates.md](references/report-templates.md) for the required output.
