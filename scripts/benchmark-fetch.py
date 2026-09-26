"""Download public research inputs, retaining URLs, timestamps and SHA256 hashes.

Only data files are extracted from archives; downloaded code is never run.
Raw sources stay in the ignored .build directory, outside the deployed site.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse, unquote, quote
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".build" / "technique-benchmark"
CACHE.mkdir(parents=True, exist_ok=True)

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.current = None
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current = {"href": dict(attrs).get("href", ""), "text": ""}
    def handle_data(self, text):
        if self.current is not None: self.current["text"] += text
    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            self.links.append(self.current); self.current = None

def fetch(url):
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    folder = CACHE / "raw" / key
    folder.mkdir(parents=True, exist_ok=True)
    meta_path = folder / "source.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    print("FETCH " + url, flush=True)
    request = Request(quote(url, safe=":/?&=%#@+"), headers={"User-Agent": "BridgeStudy-Research/1.0 (public bridge teaching data evaluation)"})
    try:
        with urlopen(request, timeout=45) as response:
            data = response.read(20_000_001)
            if len(data) > 20_000_000: raise ValueError("File exceeds 20MB limit")
            meta = {"url": url, "final_url": response.url, "retrieved": datetime.now(timezone.utc).isoformat(), "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "content_type": response.headers.get("Content-Type"), "files": []}
        name = re.sub(r"[^\w. -]", "_", unquote(Path(urlparse(url).path).name)) or "index.html"
        path = folder / name
        path.write_bytes(data)
        meta["download"] = str(path.relative_to(ROOT)).replace("\\", "/")
        if data[:2] == b"PK":
            with ZipFile(io.BytesIO(data)) as archive:
                for index, member in enumerate(archive.infolist()):
                    if member.is_dir() or Path(member.filename).suffix.lower() not in (".pbn", ".txt", ".lin", ".htm", ".html", ".csv"):
                        continue
                    if member.file_size > 20_000_000: continue
                    out = folder / (str(index) + "_" + re.sub(r"[^\w. -]", "_", Path(member.filename).name))
                    out.write_bytes(archive.read(member))
                    meta["files"].append({"archive_member": member.filename, "path": str(out.relative_to(ROOT)).replace("\\", "/")})
        else:
            meta["files"].append({"path": meta["download"]})
        if "html" in (meta["content_type"] or ""):
            parser = Links(); parser.feed(data.decode("utf-8", "replace"))
            meta["links"] = [{"url": urljoin(meta["final_url"], link["href"]), "text": link["text"].strip()} for link in parser.links if link["href"]]
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return meta
    except Exception as error:
        return {"url": url, "error": str(error)}

if __name__ == "__main__":
    urls = sys.argv[1:]
    if len(urls) == 1 and Path(urls[0]).is_file(): urls = json.loads(Path(urls[0]).read_text(encoding="utf-8-sig"))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch, urls))
    (CACHE / "last-fetch.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    for result in results:
        print(json.dumps({k: v for k, v in result.items() if k not in ("links", "files")}, ensure_ascii=True))
