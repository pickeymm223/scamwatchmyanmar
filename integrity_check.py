#!/usr/bin/env python3
"""ScamWatch website integrity check.
Compares live deployed files against .integrity.json baseline.
Output: INTEGRITY_OK | INTEGRITY_FAIL | NO_BASELINE
"""
import hashlib, json, os, subprocess, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASELINE_PATH = os.path.join(BASE_DIR, ".integrity.json")
FILES = ["index.html", "style.css", "app.js", "blog/index.html", "cms/index.html"]
LIVE_BASE = "https://scamwatchmyanmar.com"

def sha256_of_url(url):
    # NOTE: Python urllib is blocked by the edge (TLS fingerprint) since the
    # 2026-10-06 DNS move to Cloudflare — curl works, urllib does not.
    p = subprocess.run(
        ["curl", "-s", "--max-time", "30", url],
        capture_output=True, timeout=45,
    )
    if p.returncode != 0 or not p.stdout:
        raise RuntimeError(f"curl failed (rc={p.returncode})")
    return hashlib.sha256(p.stdout).hexdigest()

def main():
    if not os.path.exists(BASELINE_PATH):
        print("NO_BASELINE")
        return 2
    with open(BASELINE_PATH) as f:
        baseline = json.load(f)
    failed = []
    for fname in FILES:
        try:
            live_hash = sha256_of_url(f"{LIVE_BASE}/{fname}")
        except Exception as e:
            print(f"INTEGRITY_FAIL: cannot fetch {fname}: {e}")
            return 1
        expected = baseline.get(fname)
        if expected is None:
            failed.append(f"{fname} (no baseline)")
        elif live_hash[:16] != expected[:16]:
            failed.append(fname)
    if failed:
        print(f"INTEGRITY_FAIL: {', '.join(failed)}")
        return 1
    print("INTEGRITY_OK")
    return 0

if __name__ == "__main__":
    sys.exit(main())
