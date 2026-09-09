import copy
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENGINE = ROOT / "game-settlement" / "scripts" / "calculate.py"

def load_engine():
    if not ENGINE.exists():
        return None
    spec = importlib.util.spec_from_file_location("settlement_calculate", ENGINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

engine = load_engine()

def case():
    return {
        "id": "synthetic-01", "batch": "2026-06",
        "scope": {"channel":"channel-a","entity":"entity-a","product":"game-a",
                  "region":"region-a","platform":"pc","partner":"partner-a","contract":"contract-a"},
        "period_start":"2026-05-01", "period_end":"2026-05-31",
        "source_refs":["synthetic:statement:row5"],
        "basis_confirmed":True, "version_confirmed":True,
        "inputs":{"gross":"1000","refunds":"100","excluded":"100",
                  "fee_rate":"0.10","share_rate":"0.50"},
        "rule": {
            "id":"synthetic-rule-v1","status":"approved","evidence":"synthetic:approved-contract",
            "scope":{"channel":"channel-a","entity":"entity-a","product":"game-a",
                     "region":"region-a","platform":"pc","partner":"partner-a","contract":"contract-a"},
            "effective_from":"2026-01-01","effective_to":"2026-12-31",
            "currency":"CNY","rounding":"ROUND_HALF_UP",
            "input_constraints":{"gross":{"min":"0"},"refunds":{"min":"0"},
                "excluded":{"min":"0"},"fee_rate":{"min":"0","max":"1"},"share_rate":{"min":"0","max":"1"}},
            "steps":[
                {"name":"eligible","op":"sub","args":["gross","refunds","excluded"],"places":2},
                {"name":"fee","op":"mul","args":["eligible","fee_rate"],"places":2},
                {"name":"basis","op":"sub","args":["eligible","fee"],"places":2},
                {"name":"payable","op":"mul","args":["basis","share_rate"],"places":2}],
            "outputs":["payable"]
        }
    }

class CalculationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(engine, "缺少固定金额复算脚本，无法验证结算结果")
    def test_confirmed_case(self):
        result=engine.calculate_case(case())
        self.assertEqual(result["outputs"],{"payable":"360.00"})
        self.assertEqual(result["trace"][1]["value"],"80.00")
    def test_decimal_half_up(self):
        c=case(); c["inputs"]={"v":"1.005"}
        c["rule"]["input_constraints"]={"v":{}}
        c["rule"]["steps"]=[{"name":"payable","op":"add","args":["v"],"places":2}]
        self.assertEqual(engine.calculate_case(c)["outputs"]["payable"],"1.01")
    def test_negative_half_up(self):
        c=case(); c["inputs"]={"v":"-1.005"}
        c["rule"]["input_constraints"]={"v":{}}
        c["rule"]["steps"]=[{"name":"payable","op":"add","args":["v"],"places":2}]
        self.assertEqual(engine.calculate_case(c)["outputs"]["payable"],"-1.01")
    def test_mixed_period_preserved(self):
        r=engine.calculate_case(case())
        self.assertEqual(r["period_start"],"2026-05-01")
        self.assertEqual(r["batch"],"2026-06")
    def test_candidate_blocked(self):
        c=case(); c["rule"]["status"]="candidate"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_source_missing(self):
        c=case();c["source_refs"]=[]
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_scope_mismatch(self):
        c=case();c["scope"]["partner"]="partner-b"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_invalid_date(self):
        c=case();c["period_end"]="2026-04-31"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_rule_boundary(self):
        c=case();c["rule"]["effective_from"]="2026-05-15"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_ambiguous_version(self):
        c=case();c["version_confirmed"]=False
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_unknown_basis(self):
        c=case();c["basis_confirmed"]=False
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_no_float(self):
        c=case();c["inputs"]["gross"]=1000.0
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_nonfinite(self):
        for v in ["NaN","Infinity","-Infinity"]:
            c=case();c["inputs"]["gross"]=v
            with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_rate_out_of_range(self):
        c=case();c["inputs"]["fee_rate"]="1.1"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_missing_operand(self):
        c=case();del c["inputs"]["refunds"]
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_no_eval(self):
        c=case();c["rule"]["steps"][0]["op"]="eval"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_duplicate_step(self):
        c=case();c["rule"]["steps"][0]["name"]="gross"
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_zero_divisor(self):
        c=case();c["inputs"]={"n":"1","d":"0"};c["rule"]["input_constraints"]={"n":{},"d":{}}
        c["rule"]["steps"]=[{"name":"payable","op":"div","args":["n","d"],"places":2}]
        with self.assertRaises(ValueError):engine.calculate_case(c)
    def test_duplicate_business_identity(self):
        a=case();b=copy.deepcopy(a);b["id"]="synthetic-02"
        r=engine.calculate_batch({"cases":[a,b]})
        self.assertEqual(len(r["results"]),0)
        self.assertEqual(len(r["blocked"]),2)
    def test_partial_batch(self):
        a=case();b=case();b["id"]="bad";b["scope"]["product"]="game-b"
        r=engine.calculate_batch({"cases":[a,b]})
        self.assertEqual(len(r["results"]),1)
        self.assertEqual(len(r["blocked"]),1)
    def test_input_unmodified(self):
        c=case();before=copy.deepcopy(c);engine.calculate_case(c)
        self.assertEqual(before,c)
    def test_synthetic_examples(self):
        p=ROOT/"game-settlement"/"examples"/"synthetic-batch.json"
        self.assertTrue(p.exists(),"缺少可复用的虚构验算样例")
        r=engine.calculate_batch(json.loads(p.read_text(encoding="utf-8")))
        self.assertEqual(r["blocked"],[])
        expected={"cooperation":"360.00","net-share":"350.00","host":"2520.00","profit":"0.00"}
        self.assertEqual({x["id"]:x["outputs"]["payable"] for x in r["results"]},expected)
        profit=next(x for x in r["results"] if x["id"]=="profit")
        self.assertEqual(profit["outputs"]["closing_loss"],"-50.00")

if __name__ == "__main__":
    unittest.main()
