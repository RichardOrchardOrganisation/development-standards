import io
import subprocess
import sys
import struct
import zlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from ui_proof_archive import PNG, passed_cases, validate_archive

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


IMAGE = PNG + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00")) + chunk(b"IEND", b"")

TRX = b'''<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010"><TestDefinitions><UnitTest id="1"><TestMethod className="Example.Browser.SmokeTests" /></UnitTest></TestDefinitions><Results><UnitTestResult testId="1" outcome="Passed" /></Results></TestRun>'''
JUNIT = b'<testsuites><testsuite><testcase name="flow" /></testsuite></testsuites>'


def bundle(platform="web", report=TRX, shot=IMAGE, **changes):
    entry = {"feature": "web.home.index" if platform == "web" else "mobile.home.index", "platform": platform,
             "tests": 1, "fixtures": ["SmokeTests"] if platform == "web" else [], "report": "results.xml", "screenshots": ["screen.png"]}
    manifest = {"version": 1, "headSha": "a" * 40, "testedSha": "b" * 40, "runId": "10", "attempt": "1", "job": "web-browser-tests", "entries": [entry]}
    manifest.update(changes)
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("results.xml", report)
        archive.writestr("screen.png", shot)
    return stream.getvalue()


class ProofTests(unittest.TestCase):
    def test_web_and_mobile_archives(self):
        self.assertEqual(validate_archive(bundle())["entries"][0]["tests"], 1)
        self.assertEqual(validate_archive(bundle("android", JUNIT))["entries"][0]["platform"], "android")

    def test_missing_screenshot_or_bad_identity(self):
        for args in [{"shot": b""}, {"shot": PNG}, {"headSha": "old"}, {"entries": []}, {"testedSha": "unknown"}]:
            with self.assertRaises(ValueError):
                validate_archive(bundle(**args))

    def test_zero_skipped_failed_and_wrong_fixture(self):
        for report in [TRX.replace(b'Passed', b'Failed'), TRX.replace(b'Passed', b'NotExecuted'), TRX.replace(b'SmokeTests', b'OtherTests')]:
            with self.assertRaises(ValueError):
                validate_archive(bundle(report=report))
        for content in [b'<testsuites/>', b'<testsuites><testcase><skipped/></testcase></testsuites>', b'<testsuites><testcase><failure/></testcase></testsuites>']:
            self.assertEqual(passed_cases(content), 0)

    def test_unsafe_and_duplicate_archive_paths(self):
        for name in ['../outside', '/outside', 'screen.png']:
            data = io.BytesIO(bundle())
            with zipfile.ZipFile(data, 'a') as archive:
                archive.writestr(name, 'bad')
            with self.assertRaises(ValueError):
                validate_archive(data.getvalue())

    def test_xml_entities_rejected(self):
        with self.assertRaises(ValueError):
            passed_cases(b'<!DOCTYPE a [<!ENTITY x "bad">]><testsuites/>')


    def test_pack_command_validates_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "evidence"
            source.mkdir()
            with zipfile.ZipFile(io.BytesIO(bundle())) as archive:
                for name in archive.namelist():
                    (source / name).write_bytes(archive.read(name))
            output = root / "proof.zip"
            command = [sys.executable, str(Path(__file__).with_name("ui_proof_archive.py")), "pack", "--source", str(source), "--output", str(output)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(validate_archive(output.read_bytes())["entries"][0]["tests"], 1)
            (source / "screen.png").write_bytes(b"not an image")
            output.unlink()
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
