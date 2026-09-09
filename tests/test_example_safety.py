import copy
import json
import unittest
from test_calculate import ROOT, engine

class ExampleSafetyTests(unittest.TestCase):
    def examples(self):
        return json.loads((ROOT/"game-settlement"/"examples"/"synthetic-batch.json").read_text(encoding="utf-8"))["cases"]
    def test_zero_constant_cannot_change(self):
        c=next(x for x in self.examples() if x["id"]=="profit")
        c["inputs"]["zero"]="1"
        with self.assertRaises(ValueError): engine.calculate_case(c)
    def test_zero_fx_blocked(self):
        c=next(x for x in self.examples() if x["id"]=="host")
        c["inputs"]["fx_cny_per_usd"]="0"
        with self.assertRaises(ValueError): engine.calculate_case(c)
    def test_current_loss_carries(self):
        c=next(x for x in self.examples() if x["id"]=="profit")
        c["inputs"]["period_profit"]="-100"
        r=engine.calculate_case(c)
        self.assertEqual(r["outputs"],{"payable":"0.00","closing_loss":"-250.00"})
    def test_same_game_different_contracts_allowed(self):
        a=next(x for x in self.examples() if x["id"]=="net-share")
        b=copy.deepcopy(a); b["id"]="other-contract"
        b["scope"]["contract"]="contract-b";b["scope"]["partner"]="partner-b"
        b["rule"]["scope"]=copy.deepcopy(b["scope"])
        result=engine.calculate_batch({"cases":[a,b]})
        self.assertEqual(len(result["results"]),2)
        self.assertEqual(result["blocked"],[])

if __name__=="__main__":unittest.main()
