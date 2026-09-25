"""Reproducible DDS3 build. Requires git, Python, and Emscripten 5.0.7.

Set EMXX to em++.bat/em++ or install emsdk under .build/emsdk.
The output has no pthreads or SharedArrayBuffer dependency (GitHub Pages).
"""
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DDS_REV = "84b061ead1bfc636517e371b18d63034966df1b3"
DDS = ROOT / ".build/dds"
OUT = ROOT / "vendor/dds"

def run(args):
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True)

if not (DDS / ".git").exists():
    run(["git", "clone", "https://github.com/dds-bridge/dds.git", DDS])
run(["git", "-C", DDS, "checkout", "--detach", DDS_REV])
emxx = os.environ.get("EMXX") or shutil.which("em++")
if not emxx:
    emxx = ROOT / ".build/emsdk/upstream/emscripten" / ("em++.bat" if os.name == "nt" else "em++")
if not Path(emxx).exists():
    raise SystemExit("Install Emscripten 5.0.7 and set EMXX. See README.md.")
OUT.mkdir(parents=True, exist_ok=True)
sources = sorted((DDS / "library/src").rglob("*.cpp"))
args = [str(emxx), *map(str, sources), str(ROOT / "wasm/bridge.cpp"),
        "-I" + str(DDS / "library/src"), "-O3", "-flto", "-std=c++20",
        "-fexceptions", "-fwasm-exceptions", "--no-entry",
        "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sEXPORT_NAME=createDDS",
        "-sENVIRONMENT=web,worker,node", "-sALLOW_MEMORY_GROWTH=1",
        "-sINITIAL_MEMORY=33554432", "-sMAXIMUM_MEMORY=268435456", "-sSTACK_SIZE=2097152",
        '-sEXPORTED_FUNCTIONS=["_bridge_table","_bridge_solve","_bridge_par","_bridge_reset","_bridge_error","_malloc","_free"]',
        '-sEXPORTED_RUNTIME_METHODS=["HEAP32","HEAPU8","UTF8ToString"]',
        "-o", str(OUT / "dds.js")]
# Response files avoid Windows command-line limits and preserve spaces.
response = ROOT / ".build/wasm-args.rsp"
response.write_text("\n".join(json.dumps(a) for a in args[1:]), encoding="utf-8")
run([emxx, "@" + str(response)])
shutil.copyfile(DDS / "LICENSE", OUT / "LICENSE")
(OUT / "version.json").write_text(json.dumps({
    "repository": "https://github.com/dds-bridge/dds", "revision": DDS_REV,
    "emscripten": "5.0.7", "threaded": False
}, indent=2) + "\n", encoding="utf-8")
print("Built vendor/dds/dds.js and dds.wasm")
