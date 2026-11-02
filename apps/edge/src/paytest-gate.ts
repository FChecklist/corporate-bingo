// WHO MAY OPEN THE PAYMENT TEST (the Rs 1 / US$ 1 payment that buys nothing). THE ONE SWITCH.
//
// true  = owner key required on every address under /api/payments/paytest. Anyone else, with no key or a wrong key, gets the SAME answer: 404 {"error":"Not found"}.
// false = the test is open to anyone (how Corporate Tambola's test was first ordered, 10 Oct 2026).
//
// All six games carry this same file, so a wrong key behaves the same everywhere. Change the value here and nowhere else.
export const PAYTEST_OWNER_ONLY = true;

/** True when this request must be refused with the plain 404: the test is owner-only and the caller did not present the owner key. */
export const paytestBlocked = (path: string, ownerOk: boolean): boolean => PAYTEST_OWNER_ONLY && /^\/api\/payments\/paytest(\/|$)/.test(path) && !ownerOk;
