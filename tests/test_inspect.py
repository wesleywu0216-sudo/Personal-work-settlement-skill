import importlib.util
import io
import pathlib
import tempfile
import unittest
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"game-settlement"/"scripts"/"inspect_workbooks.py"
engine=None
if SCRIPT.exists():
    spec=importlib.util.spec_from_file_location("inspector",SCRIPT)
    engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)

def workbook():
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w") as z:
        z.writestr("xl/workbook.xml",'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="对账单" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml",'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C3"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>结算期间</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2026.04.31</t></is></c><c r="B2"><f>100*0.5</f><v>50</v></c><c r="C2" t="e"><v>#REF!</v></c></row></sheetData></worksheet>')
        z.writestr("xl/externalLinks/externalLink1.xml","<externalLink/>")
    return b.getvalue()

class InspectTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(engine,"缺少只读Excel检查器")
    def test_metadata_default(self):
        r=engine.inspect_bytes(workbook(),"sample.xlsx")
        self.assertEqual(r["sheets"][0]["name"],"对账单")
        self.assertEqual(r["external_links"],1)
        self.assertNotIn("cells",r["sheets"][0])
    def test_details_preserve_formula_and_cache(self):
        r=engine.inspect_bytes(workbook(),"sample.xlsx",details=True)
        cells={c["cell"]:c for c in r["sheets"][0]["cells"]}
        self.assertEqual(cells["B2"]["formula"],"100*0.5")
        self.assertEqual(cells["B2"]["cached"],"50")
        self.assertEqual(cells["C2"]["error"],"#REF!")
        self.assertIn("2026.04.31",r["sheets"][0]["invalid_dates"])
    def test_no_source_changes(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"sample.xlsx";p.write_bytes(workbook())
            before=p.read_bytes()
            self.assertEqual(len(list(engine.inspect_path(p))),1)
            self.assertEqual(before,p.read_bytes())
    def test_zip_no_extraction_and_lock_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"samples.zip"
            with zipfile.ZipFile(p,"w") as z:
                z.writestr("../outside.xlsx",workbook())
                z.writestr("~$lock.xlsx",b"lock")
            results=list(engine.inspect_path(p))
            self.assertEqual(len(results),1)
            self.assertEqual(len(list(pathlib.Path(d).iterdir())),1)
    def test_bad_zip_reported(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"bad.xlsx";p.write_text("bad")
            results=list(engine.inspect_path(p))
            self.assertIn("error",results[0])
    def test_unsupported_file_reported(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"old.xls";p.write_bytes(b"old")
            self.assertIn("error",list(engine.inspect_path(p))[0])

if __name__=="__main__":
    unittest.main()
