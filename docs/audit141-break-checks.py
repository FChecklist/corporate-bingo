#!/usr/bin/env python3
"""Deliberate-break checks for the Bingo 1.4.1 audit tests (tests/bingo-1.4.1-2026-10-30).

For each break: put the product file right (git checkout), run the named test file -> must be GREEN,
apply ONE small wrong edit to the product file, run the same test file -> must be RED, then put the file right again.
Product code is only changed for the length of one run and is always restored with `git checkout -- <file>`; nothing is committed.

    python3 docs/audit141-break-checks.py            # all breaks
    python3 docs/audit141-break-checks.py B01 B14    # chosen breaks
Prints a markdown table (id, what is broken, file, green before, red during, failing tests during, green after).
"""
import re, subprocess, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = "apps/edge/test/audit-141.test.ts"
M = "apps/edge/test/audit-141-matrix.test.ts"
W = "apps/web/test/audit-141.test.ts"
G = "apps/edge/test/migrations.test.ts"

# (id, what is broken, product file, exact old text, new text, test file)
BREAKS = [
    ("B01", "EMAIL_ID_RE loses the backslash in \\s (the letter s is refused)", "apps/edge/src/people.ts", "const EMAIL_ID_RE = /^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$/;", "const EMAIL_ID_RE = /^[^s@]{1,64}@[^s@]{1,255}\\.[^s@]{2,}$/;", E),
    ("B02", "EMAIL_ID_RE: the dot before the last part is no longer escaped", "apps/edge/src/people.ts", "{1,255}\\.[^\\s@]{2,}$/;", "{1,255}.[^\\s@]{2,}$/;", E),
    ("B03", "accountEmail: the zero-width list loses its backslash (u200B-u200D becomes a letter range)", "apps/edge/src/emailkey.ts", "replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\")", "replace(/[u200B-u200D\\u2060\\uFEFF]/g, \"\")", E),
    ("B04", "emailKey stops removing inner spaces (participant Email ID keeps them)", "apps/edge/src/emailkey.ts", "accountEmail(raw).replace(/\\s+/g, \"\")", "accountEmail(raw)", E),
    ("B05", "accountEmail removes inner spaces (sign-in would mend 'ra jat@..' instead of refusing)", "apps/edge/src/emailkey.ts", ".trim().toLowerCase();\nexport const emailKey", ".replace(/\\s+/g, \"\").toLowerCase();\nexport const emailKey", E),
    ("B06", "normId (email): 'nothing typed' test loses the backslash in the zero-width list", "apps/edge/src/people.ts", "if (kind === \"email\") { const t = String(raw ?? \"\"); if (!t.replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\")) return \"\";", "if (kind === \"email\") { const t = String(raw ?? \"\"); if (!t.replace(/[\\su200B-u200D\\u2060\\uFEFF]/g, \"\")) return \"\";", E),
    ("B07", "/who no longer refuses an unusable ID (back to known:false)", "apps/edge/src/worker.ts", "if (vf.mode !== \"mobile\" && String(b?.empId ?? \"\").trim() !== \"\" && id === null)", "if (vf.mode !== \"mobile\" && String(b?.empId ?? \"\").trim() !== \"\" && false)", E),
    ("B08", "lock ignores people who JOINED (participant)", "apps/edge/src/worker.ts", "&& ((have?.c ?? 0) > 0 || (listed?.c ?? 0) > 0))", "&& ((listed?.c ?? 0) > 0))", E),
    ("B09", "lock ignores people who are LISTED (person)", "apps/edge/src/worker.ts", "&& ((have?.c ?? 0) > 0 || (listed?.c ?? 0) > 0))", "&& ((have?.c ?? 0) > 0))", E),
    ("B10", "lock gives another error code", "apps/edge/src/worker.ts", "code: \"id-kind-locked\"", "code: \"idkind\"", E),
    ("B11", "lock covers idKind but not verify", "apps/edge/src/worker.ts", "(cur.idKind !== nk || cur.mode !== nm)", "(cur.idKind !== nk)", E),
    ("B12", "lock sentence changed", "apps/edge/src/worker.ts", "Start a new game to use a different kind of ID.", "Start a new game to use another kind of ID.", E),
    ("B13", "EMP_CLEAN_FROM_MS set to 2020 (new employee-ID rule on for every game)", "apps/edge/src/people.ts", "export const EMP_CLEAN_FROM_MS = Date.UTC(2099, 0, 1);", "export const EMP_CLEAN_FROM_MS = Date.UTC(2020, 0, 1);", E),
    ("B14", "APPROVAL_RULES_FROM_MS set to 2020 (30-minute rule on for every game)", "apps/edge/src/approvals.ts", "export const APPROVAL_RULES_FROM_MS = Date.UTC(2099, 0, 1);", "export const APPROVAL_RULES_FROM_MS = Date.UTC(2020, 0, 1);", E),
    ("B15", "rehearsal takes the clock, not the real game's created_ms", "apps/edge/src/rehearsal.ts", "real.created_ms ?? now", "now", E),
    ("B16", "ensureRehearsalColumns no longer skips existing columns", "apps/edge/src/rehearsal.ts", "if (col && have.has(col)) continue;", "", E),
    ("B17", "ensureRehearsalColumns: the column-name regex loses its backslash (\\w)", "apps/edge/src/rehearsal.ts", "/ADD COLUMN (\\w+)/", "/ADD COLUMN (w+)/", E),
    ("B18", "normId: an e-mail in an employee-ID game is mangled again instead of refused", "apps/edge/src/people.ts", "&& looksLikeEmail(raw)) return null;", "&& false) return null;", E),
    ("B19", "info/summary idClean always false", "apps/edge/src/worker.ts", "idClean: Number(e.created_ms) >= EMP_CLEAN_FROM_MS, brandMomentsAllowed", "idClean: false, brandMomentsAllowed", E),
    ("B20", "sign-up (/api/start) mends inner spaces instead of refusing", "apps/edge/src/worker.ts", "if (req.method === \"POST\" && p === \"/api/start\") {\n    const b = await body(req);\n    const email = typeof b?.email === \"string\" ? accountEmail(b.email) : \"\";", "if (req.method === \"POST\" && p === \"/api/start\") {\n    const b = await body(req);\n    const email = typeof b?.email === \"string\" ? accountEmail(b.email).replace(/\\s+/g, \"\") : \"\";", E),
    ("B21", "Host add mends inner spaces instead of refusing", "apps/edge/src/worker.ts", "const hEmail = typeof hb?.email === \"string\" ? accountEmail(hb.email) : \"\";", "const hEmail = typeof hb?.email === \"string\" ? accountEmail(hb.email).replace(/\\s+/g, \"\") : \"\";", E),
    ("B22", "checkout e-mail check mends inner spaces", "apps/edge/src/pay.ts", "if (typeof b.email !== \"string\" || !EMAIL.test(b.email.trim())) return json({ error: \"Enter a valid e-mail address.\" }, 400);\n    // minimum to pay", "if (typeof b.email !== \"string\" || !EMAIL.test(b.email.replace(/\\s+/g, \"\"))) return json({ error: \"Enter a valid e-mail address.\" }, 400);\n    // minimum to pay", E),
    ("B23", "matrix: EMAIL_ID_RE allows 65-character local parts", "apps/edge/src/people.ts", "{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$/;", "{1,65}@[^\\s@]{1,255}\\.[^\\s@]{2,}$/;", M),
    ("B24", "matrix: Email ID no longer lower-cased", "apps/edge/src/emailkey.ts", ".trim().toLowerCase();\nexport const emailKey", ".trim();\nexport const emailKey", M),
    ("B25", "matrix: zero-width characters no longer removed from a participant Email ID", "apps/edge/src/emailkey.ts", "replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\")", "replace(/[\\u200B-\\u200D]/g, \"\")", M),
    ("B26", "migration 0030 loses a column", "apps/edge/migrations/0030_rehearsal.sql", "ALTER TABLE engagement ADD COLUMN run_no INTEGER;\n", "", G),
    ("B27", "REHEARSAL_SCHEMA and 0030 disagree (a column type changes)", "apps/edge/src/rehearsal.ts", "ALTER TABLE engagement ADD COLUMN run_no INTEGER", "ALTER TABLE engagement ADD COLUMN run_no TEXT", G),
    ("B28", "'Which ID?' switched on in the new flow", "apps/web/public/zc-flow-game.js", "  idKind: false,", "  idKind: true,", W),
    ("B29", "join page hint appears for an e-mail in an employee-ID game", "apps/web/public/z.js", "else if (INFO.idClean && v.indexOf(\"@\") < 0) c =", "else if (INFO.idClean) c =", W),
    ("B30", "console hint/refusal: e-mail in a new-rule employee-ID game is no longer refused", "apps/web/public/zc.js", "return idCleanOn() && v.indexOf(\"@\") >= 0 ?", "return false && v.indexOf(\"@\") >= 0 ?", W),
    ("B31", "console: Email-ID rows cleaned with the employee-ID cleaner", "apps/web/public/zc.js", "idKindNow() === \"email\" ? v.replace(/[\\s\\u200B-\\u200D\\u2060\\uFEFF]/g, \"\").toLowerCase() :", "idKindNow() === \"email\" ? v.toUpperCase().replace(/[^A-Z0-9]/g, \"\") :", W),
    ("B32", "console: the Email ID shape check in zc.js loses the backslash in \\s", "apps/web/public/zc.js", "return /^[^\\s@]{1,64}@[^\\s@]{1,255}\\.[^\\s@]{2,}$/.test(idKeyOf(v))", "return /^[^s@]{1,64}@[^s@]{1,255}\\.[^s@]{2,}$/.test(idKeyOf(v))", W),
    ("B33", "console: duplicates after cleaning are dropped silently again", "apps/web/public/zc.js", "(sameId.length ? \"Same employee ID after cleaning: \"", "(false ? \"Same employee ID after cleaning: \"", W),
    ("B34", "guide.js: a card string no longer matches what the Worker sends", "apps/web/public/guide.js", "m: [\"Please check your Email ID. It looks incomplete\"]", "m: [\"Please check your Email ID. It looks incompleet\"]", W),
    ("B35", "guide.js: template syntax in a new card", "apps/web/public/guide.js", "w: \"You typed an e-mail address, but the organizer asked for an employee ID.\"", "w: \"You typed an e-mail address, but the organizer asked for ${idWord}.\"", W),
    ("B36", "guide.js: the game-ended row is duplicated", "apps/web/public/guide.js", "    { m: [\"This looks like an Email ID. This game asks for an employee ID\"]", "    { m: [\"The game has ended, so no one can be added\"], k: \"blocked\", t: \"This game has already ended\", w: \"x\", d: [\"y\"], g: { none: true } },\n    { m: [\"This looks like an Email ID. This game asks for an employee ID\"]", W),
    ("B37", "guide.js: the e-mail-in-employee-game card is removed", "apps/web/public/guide.js", "m: [\"This looks like an Email ID. This game asks for an employee ID\"]", "m: [\"This text is never sent\"]", W),
]


def sh(*a, **k):
    return subprocess.run(a, cwd=ROOT, capture_output=True, text=True, **k)


def run_tests(tf):
    r = sh("bun", "test", "--isolate", tf)
    out = r.stdout + r.stderr
    p = re.findall(r"^\s*(\d+) pass", out, re.M); f = re.findall(r"^\s*(\d+) fail", out, re.M)
    fails = re.findall(r"^\(fail\) (.*?)(?: \[[\d.]+m?s\])?$", out, re.M)
    return (int(p[-1]) if p else -1), (int(f[-1]) if f else -1), fails


def main():
    chosen = set(sys.argv[1:])
    dirty = sh("git", "status", "--porcelain", "--", "apps/edge/src", "apps/edge/migrations", "apps/web/public", "packages", "tools").stdout.strip()
    if dirty:
        print("Product files are not clean, refusing to run:\n" + dirty); sys.exit(2)
    print("| id | what is broken | file | green before | red during (fail count) | tests that went red | green after |\n|---|---|---|---|---|---|---|")
    bad = 0
    for bid, what, pf, old, new, tf in BREAKS:
        if chosen and bid not in chosen:
            continue
        path = os.path.join(ROOT, pf)
        src = open(path, encoding="utf8").read()
        n = src.count(old)
        if n != 1:
            print(f"| {bid} | {what} | {pf} | - | - | BREAK DID NOT APPLY: the old text occurs {n} times | - |"); bad += 1; continue
        b = run_tests(tf)
        try:
            open(path, "w", encoding="utf8").write(src.replace(old, new, 1))
            d = run_tests(tf)
        finally:
            sh("git", "checkout", "--", pf)
        a = run_tests(tf)
        ok = b[1] == 0 and d[1] > 0 and a[1] == 0
        bad += 0 if ok else 1
        names = "; ".join(x[:110] for x in d[2][:3]) + (f" (+{len(d[2]) - 3} more)" if len(d[2]) > 3 else "")
        print(f"| {bid} | {what} | `{pf}` | {'green' if b[1] == 0 else 'RED ' + str(b[1])} ({b[0]} pass) | {'RED' if d[1] > 0 else 'STILL GREEN'} ({d[1]}) | {names} | {'green' if a[1] == 0 else 'RED ' + str(a[1])} ({a[0]} pass) |", flush=True)
    left = sh("git", "status", "--porcelain", "--", "apps/edge/src", "apps/edge/migrations", "apps/web/public", "packages", "tools").stdout.strip()
    print("\nProduct files after the run: " + ("CLEAN (nothing changed)" if not left else "NOT CLEAN\n" + left))
    print(f"\nBreaks that did not behave (not red, or not green before/after, or did not apply): {bad}")
    sys.exit(1 if bad or left else 0)


main()
