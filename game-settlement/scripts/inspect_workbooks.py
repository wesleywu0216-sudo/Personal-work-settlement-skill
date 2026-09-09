"""Read-only OOXML inspection. Never evaluates formulas or extracts ZIP members."""
import argparse
from datetime import date
import hashlib
import io
import json
import pathlib
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

N={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID="{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
MAX_MEMBER=256*1024*1024
MAX_TOTAL=1024*1024*1024

def safe_zip(z):
    infos=z.infolist()
    if any(i.file_size>MAX_MEMBER for i in infos) or sum(i.file_size for i in infos)>MAX_TOTAL:
        raise ValueError("压缩包展开体积超出检查器限制，请拆分文件")

def xml(z,name):
    content=z.read(name)
    if b"<!DOCTYPE" in content or b"<!ENTITY" in content:
        raise ValueError("不支持带DTD或实体声明的XML")
    return ET.fromstring(content)

def bad_dates(text):
    found=[]
    for match in re.finditer(r"(?<!\d)(\d{4})[./-](\d{2})[./-](\d{2})(?!\d)",text):
        try:
            date(*(int(v) for v in match.groups()))
        except ValueError:
            found.append(match.group(0))
    return found

def inspect_bytes(content,label,details=False,max_rows=30):
    result={"file":label,"sha256":hashlib.sha256(content).hexdigest(),"sheets":[],
            "sample_rows":max_rows if details else 0,
            "note":"不执行公式；缓存值可能过期；细节只覆盖取样行"}
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        safe_zip(z)
        wb=xml(z,"xl/workbook.xml")
        rels={e.attrib["Id"]:e.attrib for e in xml(z,"xl/_rels/workbook.xml.rels")}
        result["external_links"]=len([n for n in z.namelist()
            if re.fullmatch(r"xl/externalLinks/externalLink\d+\.xml",n)])
        strings=[]
        if details and "xl/sharedStrings.xml" in z.namelist():
            strings=["".join(e.itertext()) for e in xml(z,"xl/sharedStrings.xml")]
        for sheet in wb.find("m:sheets",N):
            item={"name":sheet.attrib["name"],"state":sheet.attrib.get("state","visible")}
            result["sheets"].append(item)
            if not details:
                continue
            link=rels.get(sheet.attrib.get(RID),{})
            target=link.get("Target","")
            if link.get("TargetMode")=="External":
                item["error"]="工作表指向外部资源，未访问"
                continue
            target=target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/"+target)
            if not target.startswith("xl/"):
                item["error"]="工作表路径无效"
                continue
            data=xml(z,target)
            dimension=data.find("m:dimension",N)
            item["dimension"]=dimension.attrib.get("ref") if dimension is not None else None
            item["cells"]=[]
            item["invalid_dates"]=[]
            for row in data.findall("m:sheetData/m:row",N):
                if int(row.attrib.get("r",0))>max_rows:
                    break
                for c in row:
                    if not c.tag.endswith("}c"):
                        continue
                    cell={"cell":c.attrib["r"]}
                    value=c.find("m:v",N)
                    formula=c.find("m:f",N)
                    kind=c.attrib.get("t","n")
                    if formula is not None:
                        cell["formula"]=formula.text
                        if formula.attrib:
                            cell["formula_attributes"]=dict(formula.attrib)
                        cell["cached"]=value.text if value is not None else None
                    elif kind=="s" and value is not None:
                        cell["text"]=strings[int(value.text)]
                    elif kind=="inlineStr":
                        node=c.find("m:is",N)
                        cell["text"]="".join(node.itertext()) if node is not None else ""
                    elif kind=="e":
                        cell["error"]=value.text if value is not None else None
                    elif value is not None:
                        cell["value"]=value.text
                        cell["type"]=kind
                    if "text" in cell:
                        item["invalid_dates"].extend(bad_dates(cell["text"]))
                    if len(cell)>1:
                        item["cells"].append(cell)
    return result

def member_label(info):
    name=info.filename
    if not info.flag_bits & 2048:
        try:
            name=name.encode("cp437").decode("gb18030")
        except (UnicodeEncodeError,UnicodeDecodeError):
            pass
    return name

def inspect_path(path,details=False,max_rows=30):
    path=pathlib.Path(path)
    if path.name.startswith("~$"):
        return
    if path.is_dir():
        for child in sorted(path.rglob("*")):
            if child.is_file() and not child.is_symlink() and child.suffix.lower() in (".xlsx",".zip",".xls",".xlsm"):
                yield from inspect_path(child,details,max_rows)
        return
    try:
        if path.suffix.lower()==".xlsx":
            if path.stat().st_size>MAX_MEMBER:
                raise ValueError("文件过大，请拆分")
            yield inspect_bytes(path.read_bytes(),str(path),details,max_rows)
        elif path.suffix.lower()==".zip":
            with zipfile.ZipFile(path) as outer:
                safe_zip(outer)
                for info in outer.infolist():
                    name=member_label(info)
                    if info.is_dir() or posixpath.basename(name).startswith("~$"):
                        continue
                    if not name.lower().endswith((".xlsx",".xls",".xlsm")):
                        continue
                    label=str(path)+"::"+name
                    if not name.lower().endswith(".xlsx"):
                        yield {"file":label,"error":"仅支持xlsx；旧格式或宏工作簿需专用工具"}
                        continue
                    try:
                        yield inspect_bytes(outer.read(info),label,details,max_rows)
                    except (OSError,ValueError,KeyError,IndexError,ET.ParseError,zipfile.BadZipFile,RuntimeError) as exc:
                        yield {"file":label,"error":str(exc)}
        else:
            yield {"file":str(path),"error":"仅支持xlsx、zip和目录"}
    except (OSError,ValueError,KeyError,IndexError,ET.ParseError,zipfile.BadZipFile,RuntimeError) as exc:
        yield {"file":str(path),"error":str(exc)}

def main():
    parser=argparse.ArgumentParser(description="只读检查Excel结构；--details可能输出敏感单元格，结果应存包外")
    parser.add_argument("paths",nargs="+")
    parser.add_argument("--details",action="store_true")
    parser.add_argument("--max-rows",type=int,default=30)
    args=parser.parse_args()
    if not 1<=args.max_rows<=200:
        parser.error("--max-rows须为1至200")
    errors=False
    for p in args.paths:
        for result in inspect_path(p,args.details,args.max_rows):
            print(json.dumps(result,ensure_ascii=False))
            errors=errors or "error" in result or any("error" in s for s in result.get("sheets",[]))
    return 2 if errors else 0

if __name__=="__main__":
    sys.exit(main())
