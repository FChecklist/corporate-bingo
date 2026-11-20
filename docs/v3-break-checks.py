#!/usr/bin/env python3
"""Deliberate-break checks for the Bingo 1.4.1 v3 tests (branch tests/bingo-1.4.1-v3-2026-10-31).

For each break: run the named test files on the right product code (baseline fail count), apply ONE wrong edit to a product file,
run again (the fail count must go UP), put the file right with `git checkout -- <file>`, run again (back to the baseline).
Product code is changed only for the length of one run; nothing is committed. The baseline of audit-141-v3.test.ts is 6, not 0:
those 6 are the red PRODUCT DEFECT tests (D1 x3 too-long sentence, D2 x3 endedAtMs).

    python3 docs/v3-break-checks.py            # all breaks
    python3 docs/v3-break-checks.py V1 V3      # chosen breaks
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V3 = "apps/edge/test/audit-141-v3.test.ts"
MX = "apps/edge/test/audit-141-v3-matrix.test.ts"
EM = "apps/edge/test/audit-141-matrix.test.ts"
E141 = "apps/edge/test/audit-141.test.ts"

# (id, what is broken, product file, exact old text, new text, test files)
BREAKS = [
    ("V1", "employee ID cap 30 -> 31 after cleaning", "apps/edge/src/people.ts", "return s && s.length <= 30 ? s : null;", "return s && s.length <= 31 ? s : null;", [V3, MX]),
    ("V2", "participant Email ID keeps U+0085 (it leaves the invisible set; JS white space does not cover it)", "apps/edge/src/emailkey.ts", "\\u0085\\u200B-\\u200D", "\\u200B-\\u200D", [V3, EM, E141]),
    ("V3", "lock: the 'different way of asking for IDs' sentence is replaced by the kind sentence", "apps/edge/src/worker.ts", ": \"You already have people listed. Start a new game to use a different way of asking for IDs.\"", ": \"You already have people listed. Start a new game to use a different kind of ID.\"", [V3, E141]),
    ("V4", "account e-mail MENDS an inner invisible character (removes it) instead of refusing", "apps/edge/src/emailkey.ts", ".replace(INVISIBLE_RE, \" \")", ".replace(INVISIBLE_RE, \"\")", [V3, E141]),
    ("V5", "employee ID is no longer made upper case", "apps/edge/src/people.ts", ".normalize(\"NFKC\").toUpperCase().replace(/[^A-Z0-9]/g, \"\")", ".normalize(\"NFKC\").replace(/[^A-Z0-9]/g, \"\")", [V3, MX]),
    ("V7", "EMAIL_ID_RE loses its backslash: [^\\s@] becomes [^s@] (an address with the letter s is refused)", "apps/edge/src/people.ts", "const EMAIL_ID_RE = /^[^\\s@]{1,64}@", "const EMAIL_ID_RE = /^[^s@]{1,64}@", [V3, EM, E141]),
    ("V6", "lock ignores people who JOINED (the participant table is not read)", "apps/edge/src/people.ts", ", \"SELECT pii FROM participant WHERE eid=? AND pii IS NOT NULL LIMIT 100 OFFSET ?\"]", "]", [V3, E141]),
]

def sh(*a):
    return subprocess.run(a, cwd=ROOT, capture_output=True, text=True)

def fails(files):
    out = 0; names = []
    for f in files:
        r = sh("bun", "test", "--isolate", f); t = r.stdout + r.stderr
        m = re.search(r"^\s*(\d+) fail", t, re.M); out += int(m.group(1)) if m else 0
        names += [l[7:90] for l in t.splitlines() if l.startswith("(fail)") and "PRODUCT DEFECT" not in l]
    return out, names

def main():
    want = sys.argv[1:]; rows = []; ok_all = True
    for bid, what, pf, old, new, files in BREAKS:
        if want and bid not in want: continue
        sh("git", "checkout", "--", pf)
        base, _ = fails(files)
        src = open(os.path.join(ROOT, pf), encoding="utf8").read()
        if src.count(old) != 1:
            rows.append((bid, what, pf, base, "NOT APPLIED (old text found %d times)" % src.count(old), "", "")); ok_all = False; continue
        open(os.path.join(ROOT, pf), "w", encoding="utf8").write(src.replace(old, new))
        try: during, names = fails(files)
        finally: sh("git", "checkout", "--", pf)
        after, _ = fails(files)
        good = during > base and after == base; ok_all = ok_all and good
        rows.append((bid, what, pf, base, during, after, "; ".join(names[:3])))
    print("| id | what is broken | product file | fails before | fails during (RED if higher) | fails after | first tests that went red |\n|---|---|---|---|---|---|---|")
    for r in rows: print("| " + " | ".join(str(x) for x in r) + " |")
    d = sh("git", "diff", "--stat", "--", "apps", "packages", "tools", "pages", "config").stdout.strip()
    print("\nproduct code diff after the run: " + (d or "EMPTY"))
    sys.exit(0 if ok_all and not d else 1)

main()
