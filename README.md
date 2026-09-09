# 游戏结算 Skill

用于分析历史对账单、整理合同口径、执行固定金额复算，并指导结算函生成后的复核。覆盖发行游戏、手游和端游联运、独立主机及小游戏利润结算。正式文档默认中文。

## 使用入口
将整个 [game-settlement](game-settlement/) 文件夹交给支持 Agent Skills 的客户端加载；入口是 [SKILL.md](game-settlement/SKILL.md)。只有入口文件不够，还要保留 references、scripts 和 examples。
标准格式参考 [Agent Skills specification](https://agentskills.io/specification)。

不支持技能自动发现的模型，也可以把整个目录作为项目资料，要求它先阅读SKILL.md，再读取其中相关参考文件。
示例指令：
> 请按 game-settlement/SKILL.md 分析我提供的对账单，提取结算口径和异常。只对已确认规则复算，不推断缺失金额，也不要求补原始账单才能开始分析。

不同客户端的安装目录不同，按其文档放置；本包不依赖某个模型的专有工具名。纯聊天模型若不能执行文件和脚本，只能提供分析，不能声称已完成验算或生成文件。

## 本地检查与计算
Python 3.10+，不需要安装第三方库。命令中的python指本机可用Python；若客户端提供运行时，使用其指定解释器。

```text
python -B -m unittest discover -s tests -v
python game-settlement/scripts/inspect_workbooks.py <对账单目录或xlsx或zip>
python game-settlement/scripts/inspect_workbooks.py <文件.xlsx> --details
python game-settlement/scripts/calculate.py game-settlement/examples/synthetic-batch.json
```

检查器默认只给结构；--details会输出前30行的文本、数值和公式，可能涉及隐私，输出应留在私人目录。
四个样例完全虚构：普通联运360.00、已确认净额分成350.00、主机汇兑及预付抵扣2520.00、亏损结转应付0.00及下期亏损-50.00。它们不是生产合同。

## 能做什么
- 从xlsx、zip或目录只读盘点工作表、公式、缓存值、外部引用和日期异常。
- 将渠道/主体/产品/地区/平台/合作方/合同及期间绑定到明确规则。
- 用十进制脚本复算，输出逐步结果；错误只阻断相应单元。
- 指导有表格工具的模型按已确认模板生成结算函并核验。

## 尚未实现及验证边界
- 不含邮箱收单、自动登录、全渠道解析器、Excel自动出函引擎或生产台账数据库。
- 检查器不计算Excel公式，缓存值可能过期；日期及错误检查只覆盖取样行，不是全表审计。图表、图片、颜色语义需其他工具核实。
- 固定脚本不确认合同/来源真实性，不做税费分摊和跨批次事件去重。
- 不是“导入任意账单即可零错误结算”。版本冲突、口径不清等按规则挂起；分析工作可以继续。
- 不同厂商模型/客户端仍需按 [行为场景](tests/behavior-scenarios.md) 实测。详见 [验证记录](docs/验证记录.md)。

## 分享与私有数据
将业务文件、真实模板、合同配置、实际运行输出放在此目录之外。GitHub仅存通用方法、代码、虚构样例和验证说明。
仓库本身私有时，其他人仍需仓库访问权限；不自动改变可见性。
现有专用结算技能可继续使用，本通用技能不覆盖其代码，也不把其特定合同门槛推广到其他业务。
