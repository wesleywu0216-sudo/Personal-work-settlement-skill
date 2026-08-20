---
name: pc-game-settlement
description: Use when generating monthly PC-game co-operation settlement statements from a backend reconciliation workbook, a CP company master workbook, and an approved settlement template.
---

# 端游联运结算单批量生成

## 用途

将后台《财务对账明细》逐条核对后，按控制模板生成每个端游产品的结算确认函，并生成批次汇总清单。只处理普通端游联运结算，不判断合同或后台源数据是否真实。

开始前必须阅读 [输入、映射与异常规则](references/input-schema.md)。

## 必需输入

1. 后台财务对账明细 `.xlsx`；
2. 乙方公司信息表 `.xlsx`；
3. 已确认的端游结算单模板 `.xlsx`；
4. 可选的本批次人工排除 JSON；
5. 输出目录，默认放在 `D:\Codex`。

## 执行流程

1. 先运行 `--dry-run`，不要生成文件：

```powershell
node pc-game-settlement/scripts/cli.mjs --backend '<后台.xlsx>' --companies '<公司信息.xlsx>' --template '<模板.xlsx>' --output '<输出目录>' --exclusions '<人工排除.json>' --dry-run
```

2. 向用户展示：业务明细数、基础通过数、基础排除数、人工排除数、最终可生成数、乙方匹配数和阻断异常。
3. 用户确认整批口径后，使用相同命令移除 `--dry-run` 正式生成。
4. 返回输出目录、产品文件数、汇总文件和验证结果；若存在异常，列出受影响产品和具体字段。

## 不可改变的控制

- 合同初审和复审状态都必须精确等于“审核通过”；收入必须非零。
- 人工排除只匹配指定的 `月份 + 标准化游戏名称 + 企业名称`。不得从一个产品推导全局金额门槛。
- 游戏名只移除末尾“（PC版）”或“(PC版)”。
- 乙方资料只从公司信息表精确匹配；不得模糊匹配、借用相似公司或自动推断。
- 税费非零、重复产品、乙方资料缺失/冲突、逐条金额复算差异均阻断该产品。
- 不覆盖同名文件，不修改三个源文件，不发送邮件、企业微信或上传外部系统。
- 每份输出必须重新导入检查关键单元格、公式错误、外部链接和最终金额。

## 输出

- 产品结算单：`游戏名称 （端游）YYYYMM.xlsx`；
- 批次汇总：`端游结算单生成汇总_YYYYMM.xlsx`，含生成、排除、异常和运行信息四张表。
