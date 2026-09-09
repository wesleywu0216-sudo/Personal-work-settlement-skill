"""Execute explicitly confirmed settlement steps; Python 3.10+, standard library only."""
import argparse
from collections import Counter
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext, ROUND_HALF_UP
import json
import re
import sys

SCOPE_KEYS = ("channel", "entity", "product", "region", "platform", "partner", "contract")

def require(condition, message):
    if not condition:
        raise ValueError(message)

def nonempty(value):
    return isinstance(value, str) and bool(value.strip())

def decimal_value(value):
    require(isinstance(value, str), "数值必须为十进制字符串，不能是浮点数")
    require(bool(re.fullmatch(r"-?\d+(?:\.\d+)?", value)), "无效十进制数")
    result = Decimal(value)
    require(result.is_finite(), "数值必须有限")
    require(len(result.as_tuple().digits) <= 24 and result.as_tuple().exponent >= -12,
            "数值超出支持精度")
    return result

def iso_date(value):
    require(isinstance(value, str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)), "日期须为YYYY-MM-DD")
    return date.fromisoformat(value)

def scope_key(case):
    scope = case.get("scope", {})
    require(isinstance(scope, dict), "scope必须为对象")
    return tuple(scope.get(k) for k in SCOPE_KEYS) + (case.get("period_start"), case.get("period_end"))

def calculate_case(case):
    require(isinstance(case, dict), "结算单元必须为对象")
    for key in ("id", "batch"):
        require(nonempty(case.get(key)), "缺少" + key)
    iso_date(case["batch"] + "-01")
    require(case.get("basis_confirmed") is True, "金额口径未确认")
    require(case.get("version_confirmed") is True, "有效版本未确认")
    refs = case.get("source_refs")
    require(isinstance(refs, list) and len(refs) > 0 and all(nonempty(x) for x in refs), "缺少来源引用")
    scope = case.get("scope")
    require(isinstance(scope, dict) and set(scope) == set(SCOPE_KEYS), "scope字段不完整或包含未知字段")
    require(all(nonempty(scope[k]) for k in SCOPE_KEYS), "scope标识不能为空")
    start, end = iso_date(case.get("period_start")), iso_date(case.get("period_end"))
    require(start <= end, "期间起止倒置")
    rule = case.get("rule")
    require(isinstance(rule, dict), "缺少规则")
    require(rule.get("status") == "approved" and nonempty(rule.get("evidence")), "规则未确认或无依据")
    require(nonempty(rule.get("id")), "缺少规则ID")
    require(rule.get("scope") == scope, "规则适用范围不匹配")
    require(iso_date(rule.get("effective_from")) <= start <= end <= iso_date(rule.get("effective_to")),
            "期间跨越或超出规则生效范围")
    require(nonempty(rule.get("currency")), "缺少结算币种")
    require(rule.get("rounding") == "ROUND_HALF_UP", "不支持的舍入规则")
    inputs, constraints = case.get("inputs"), rule.get("input_constraints")
    require(isinstance(inputs, dict) and inputs, "缺少输入")
    require(isinstance(constraints, dict) and set(constraints) == set(inputs), "输入约束不完整")
    values = {}
    for name, raw in inputs.items():
        require(bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", name)), "变量名无效")
        value = decimal_value(raw)
        bounds = constraints[name]
        require(isinstance(bounds, dict) and set(bounds) <= {"min", "max"}, "输入约束无效")
        if "min" in bounds:
            require(value >= decimal_value(bounds["min"]), name + "低于下限")
        if "max" in bounds:
            require(value <= decimal_value(bounds["max"]), name + "高于上限")
        values[name] = value
    steps = rule.get("steps")
    require(isinstance(steps, list) and steps, "缺少计算步骤")
    trace = []
    with localcontext() as ctx:
        ctx.prec = 40
        for step in steps:
            require(isinstance(step, dict), "步骤必须为对象")
            name, op, args, places = (step.get(k) for k in ("name", "op", "args", "places"))
            require(isinstance(name,str) and bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*",name))
                    and name not in values, "步骤名无效或重复")
            require(isinstance(args, list) and args and all(isinstance(a,str) and a in values for a in args),
                    "步骤参数缺失或不是已定义变量")
            require(type(places) is int and 0 <= places <= 10, "舍入位数无效")
            nums = [values[a] for a in args]
            if op == "add":
                raw = sum(nums, Decimal(0))
            elif op == "sub":
                raw = nums[0] - sum(nums[1:], Decimal(0))
            elif op == "mul":
                raw = Decimal(1)
                for n in nums:
                    raw *= n
            elif op == "div":
                require(len(nums) == 2 and nums[1] != 0, "除法须两个参数且除数非零")
                raw = nums[0] / nums[1]
            elif op == "min":
                raw = min(nums)
            elif op == "max":
                raw = max(nums)
            else:
                raise ValueError("不支持的运算：" + str(op))
            require(raw.is_finite() and abs(raw) < Decimal("1e24"), "中间金额超出范围")
            try:
                value = raw.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
            except InvalidOperation as exc:
                raise ValueError("中间金额无法按规定精度舍入") from exc
            values[name] = value
            trace.append({"name":name,"op":op,"args":args,"operands":[str(n) for n in nums],
                          "places":places,"value":format(value,"f")})
    outputs = rule.get("outputs")
    require(isinstance(outputs,list) and outputs and all(isinstance(k,str) and k in values for k in outputs),
            "输出变量无效")
    require(len(set(outputs)) == len(outputs), "输出变量重复")
    return {"id":case["id"],"batch":case["batch"],"scope":dict(scope),
            "period_start":case["period_start"],"period_end":case["period_end"],
            "rule_id":rule["id"],"currency":rule["currency"],"source_refs":list(refs),
            "outputs":{k:format(values[k],"f") for k in outputs},"trace":trace}

def calculate_batch(batch):
    require(isinstance(batch,dict) and isinstance(batch.get("cases"),list) and batch["cases"], "缺少cases数组")
    cases = batch["cases"]
    identities, ids = [], []
    for c in cases:
        try:
            identities.append(json.dumps(scope_key(c),ensure_ascii=False,sort_keys=True))
            ids.append(json.dumps(c.get("id"),ensure_ascii=False))
        except (AttributeError, TypeError, ValueError):
            identities.append(None)
            ids.append(None)
    identity_counts, id_counts = Counter(identities), Counter(ids)
    result = {"results":[],"blocked":[],"note":"固定复算结果；不是正式结算函或数据真实性证明"}
    for index, c in enumerate(cases):
        try:
            require(identities[index] is not None, "无效结算单元")
            require(identity_counts[identities[index]] == 1 and id_counts[ids[index]] == 1,
                    "重复ID或同合同同范围同期间重复，请先确认版本和事件")
            result["results"].append(calculate_case(c))
        except (ValueError, TypeError, KeyError, InvalidOperation) as exc:
            result["blocked"].append({"index":index,"id":c.get("id") if isinstance(c,dict) else None,
                                       "reason":str(exc)})
    return result

def main():
    parser = argparse.ArgumentParser(description="执行已确认结算规则，仅输出JSON，不修改文件")
    parser.add_argument("input")
    args = parser.parse_args()
    try:
        with open(args.input, encoding="utf-8-sig") as handle:
            result = calculate_batch(json.load(handle))
        print(json.dumps(result,ensure_ascii=False,indent=2))
        return 2 if result["blocked"] else 0
    except (OSError,ValueError,TypeError) as exc:
        print(json.dumps({"error":str(exc)},ensure_ascii=False),file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
