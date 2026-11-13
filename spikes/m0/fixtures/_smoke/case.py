from common import Expect, Variant, font_face


def variants():
    css = font_face("Sarabun", "Sarabun-Regular.ttf")
    html = f"""<html><head><style>{css} body {{ font-family: Sarabun; }}</style></head>
<body><p>SMOKE-1 ทดสอบภาษาไทย 1,234.50</p></body></html>"""
    return [
        Variant("pass", html, font_files=["Sarabun-Regular.ttf"],
                expect=Expect(ids=["SMOKE-1"], totals=["1,234.50"], thai=["ทดสอบภาษาไทย"], fonts=["Sarabun"])),
        # deliberately wrong expectations: harness must report FAIL
        Variant("expect-fail", html, font_files=["Sarabun-Regular.ttf"],
                expect=Expect(ids=["SMOKE-2"], totals=["9.99"], thai=["ไม่มีข้อความนี้"], fonts=["Tahoma"])),
    ]
