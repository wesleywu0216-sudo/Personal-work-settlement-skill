# 固定计算脚本输入
运行：`python scripts/calculate.py examples/synthetic-batch.json`。
仅Python标准库。命令输出JSON；全部成功退出0，有单元阻断退出2，输入或文件错误退出1。脚本不修改输入，不写文件，不发送消息，不出正式Excel。

根对象：`{"cases":[...]}`。可运行样例见 [虚构批次](../examples/synthetic-batch.json)。

每项必需：
- id、batch（YYYY-MM）、scope、period_start/end（ISO日期）。
- scope包含channel/entity/product/region/platform/partner/contract，都是非空标识；同名项在rule.scope必须完全一致。
- source_refs：非空引用数组，指向私有文件/单元格或已确认输入。不要把真实引用提交到GitHub。
- basis_confirmed、version_confirmed：严格true；由用户/凭证确认后赋值，不能让模型为了运行脚本改成true。
- inputs：十进制字符串对象，禁止JSON浮点数；单位须在私有规则登记中定义。
- rule：id、status=approved、evidence、scope、effective_from/to、currency、rounding=ROUND_HALF_UP、input_constraints、steps、outputs。

input_constraints必须与inputs同名同数量，逐项可有min/max十进制边界。固定常量用min=max锁定；汇率下限必须严格为正（本脚本最小支持小数为0.000000000001）。当期利润可能为负，不得误设非负约束。无限制使用空对象，但要在规则审阅时确认负数及费率合法范围。未知输入不得自动补0。
steps每项：name、op、args、places。
- name为新变量名，不得覆盖输入或前序结果。
- args引用inputs或先前step；不支持eval、公式文本或内联数字，常量也是命名输入。
- op支持add/sub/mul/div/min/max；div仅两个参数；其他至少一个参数。
- places为0至10的整数，明确在哪一步舍入。金额和汇率可采用不同位数。
- 内部保留40位十进制精度，输入最多24位有效数字且小数不超过12位；过大或不支持的值阻断。
- outputs列出最终展示变量。每项至少一个；通常payable，可同时输出closing_loss/closing_advance。

examples中的参数及确认状态全部是虚构测试数据，不能当作生产规则。
脚本只能执行已配置步骤，不判断合同是否正确，不验证source_refs/evidence真实性，不读取外部原始账单，不持久化台账、不做跨批次去重、不生成合并币种总计。
steps不能代替完整的单位审核。若多币种计算，在命名中明确币种与汇率方向并由人确认；输出currency指最终付款币种，不代表中间输入都同币种。
不同税费、阶梯费率、复杂回款分配先在适配层确定，再传入计算脚本。未支持的算法不由模型临时猜算正式结果。
