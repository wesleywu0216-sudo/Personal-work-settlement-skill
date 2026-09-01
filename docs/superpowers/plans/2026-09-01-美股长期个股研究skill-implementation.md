# 美股长期个股研究 Skill 实施计划

## 实际路径

在当前仓库内新增 `researching-us-stocks/`，规格与计划保存在 `docs/superpowers/`。不创建独立 GitHub 仓库，不修改 `pc-game-settlement/` 或根 `package.json`。

## 实施顺序

1. **基线**：记录 NVDA、JPM、MRNA 无 Skill 行为、逐字证据、结构观察和完整案例元数据；将原始输出保存到 `researching-us-stocks/tests/baselines/` 并计算 SHA-256。
2. **核心**：创建 `SKILL.md`、`agents/openai.yaml` 和 `references/research-workflow.md`，落实身份、证券类型、无法评估、实时数据、原子门槛、两阶段、标签和异常处理。
3. **评分**：新增 `references/scorecards.md`，固定四张独立评分卡的分项、权重、锚点和逐卡置信度，禁止总分。
4. **行业、证据与模板**：新增 `references/industry-adapters.md`、`references/evidence-sources.md`、`references/report-templates.md`，承载行业模型、证据与时效规则、三类最小输出。
5. **复测**：加载 `$researching-us-stocks` 对跨行业、身份失败、证券类型不适用、无法联网和个性化建议请求等案例复测，按模板记录 expected、observed、PASS/FAIL、原始输出与哈希。
6. **校验**：运行 Skill、YAML、必需字段和内容结构检查；对所有 Markdown 相对链接执行断链校验，确认每个目标文件存在且大小写一致；审阅 Git diff，确认除已标注的 GREEN 模板变量外无未说明占位符，并确认无脚本、README 或无关改动。
7. **提交与推送**：各任务形成可独立审阅的提交；集成复测和发布门禁通过后再形成集成提交。仅在远端和发布授权明确时推送。

## 当前实施状态

- 所有 `references/` 文件已完成。
- NVDA、JPM、MRNA 的 raw baseline 文件已完成。
- 首次 GREEN 的 raw 输出已完成；首次 GREEN 结果为 `FAIL`。
- 首次 GREEN 后的 REFACTOR 已完成。
- 第二轮 GREEN 已发现问题并完成规则重构；失败输出按原样保留。
- 最终 GREEN 已用 NVDA、JPM、MRNA 三个新鲜上下文通过；哈希和可观察断言已写入行为测试日志。
- 官方 Skill 校验、YAML 解析、相对链接检查、固定 schema 扫描和最终质量审阅均已通过。
- 发布门禁已通过，可提交并推送功能分支。

## 发布门禁

在以下条件全部满足前，Skill 不可发布：

- `scorecards.md`、`industry-adapters.md`、`evidence-sources.md`、`report-templates.md` 四个引用文件全部到位。
- NVDA、JPM、MRNA 三个 raw 基线文件全部到位，日志中的相对路径可打开且 SHA-256 已填写并匹配。
- `SKILL.md`、设计规格、日志和引用文件的所有相对链接通过断链校验，不允许以“后续会创建”为由忽略断链。
- GREEN 案例元数据完整，关键情景复测通过，官方快速校验和仓库结构检查通过。
