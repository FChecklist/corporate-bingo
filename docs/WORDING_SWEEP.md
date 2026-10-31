# Wording sweep: "erase" is gone from what people read

Owner rule: never "erase / erased / erasure". The system deleting on a timer is "auto-deleted"; a person deleting is "deleted". Route names (`/erase`), function names, database columns and JSON keys (`erased`, `erasureMs`, `kind: "erasure"`) are unchanged so nothing breaks. Code comments and internal docs in `docs/` were not touched.

Each line: the old sentence, then the new one. Legal pages first.

## terms.html

- OLD: Players' personal data is erased within 24 hours after the game ends (small exceptions in clause 11).
  NEW: Players' personal data is auto-deleted within 24 hours after the game ends (small exceptions in clause 11).
- OLD: 10.2 The invitation record is Participant Personal Data and is erased with it under clause 11.
  NEW: 10.2 The invitation record is Participant Personal Data and is auto-deleted with it under clause 11.
- OLD: Personal data, roles and 24-hour erasure
  NEW: Personal data, roles and 24-hour auto-deletion
- OLD: 11.2 24-hour erasure.
  NEW: 11.2 24-hour auto-deletion.
- OLD: We erase Participant Personal Data from our systems within twenty-four (24) hours after the Game ends, consistent with Section 8(7) of the DPDP Act.
  NEW: We auto-delete Participant Personal Data from our systems within twenty-four (24) hours after the Game ends, consistent with Section 8(7) of the DPDP Act.
- OLD: A Participant may, through the Organizer or directly to the Grievance Officer, ask what data is held, ask for correction or erasure, withdraw consent, name another person who may use these rights for them if they cannot (nomination, Section 14 of the DPDP Act;
  NEW: A Participant may, through the Organizer or directly to the Grievance Officer, ask what data is held, ask for correction or deletion, withdraw consent, name another person who may use these rights for them if they cannot (nomination, Section 14 of the DPDP Act;
- OLD: If we learn that a Participant is under 18, we remove that person from the Game and erase their data.
  NEW: If we learn that a Participant is under 18, we remove that person from the Game and delete their data.
- OLD: A Participant's record is erased with the rest of Participant Personal Data within 24 hours after the game ends.
  NEW: A Participant's record is auto-deleted with the rest of Participant Personal Data within 24 hours after the game ends.

## legal-position.html

- OLD: Statement 7 — Participants' personal data is erased within 24 hours after the game ends.
  NEW: Statement 7 — Participants' personal data is auto-deleted within 24 hours after the game ends.
- OLD: All Participant Personal Data (as defined in Part II) is erased from IT Services' systems within 24 hours after the game ends, subject only to the limited exceptions stated in Part II, clause 11.3.
  NEW: All Participant Personal Data (as defined in Part II) is auto-deleted from IT Services' systems within 24 hours after the game ends, subject only to the limited exceptions stated in Part II, clause 11.3.
- OLD: DPDP Act, section 8(7): a Data Fiduciary must erase personal data once consent is withdrawn or it is reasonable to assume that the specified purpose is no longer served, whichever is earlier, unless retention is necessary for compliance with law, and must cause its Data Processor to erase it;
  NEW: DPDP Act, section 8(7): a Data Fiduciary must delete personal data once consent is withdrawn or it is reasonable to assume that the specified purpose is no longer served, whichever is earlier, unless retention is necessary for compliance with law, and must cause its Data Processor to delete it;
- OLD: section 12(3) (right to erasure).
  NEW: section 12(3) (right to deletion).
- OLD: It is Participant Personal Data and is erased with the rest (Statement 7).
  NEW: It is Participant Personal Data and is auto-deleted with the rest (Statement 7).
- OLD: 6.3 Participant Personal Data will be erased as stated in Part II, clause 11.
  NEW: 6.3 Participant Personal Data will be auto-deleted as stated in Part II, clause 11.

## legal.html

- OLD: A game that was not paid for closes when its guest data is erased, 23 hours after it was meant to end.
  NEW: A game that was not paid for closes when its guest data is auto-deleted, 23 hours after it was meant to end.

## trust.html

- OLD: Guests' names (and mobile numbers, where the organizer asked for them), and their technical records, are erased within 24 hours after the game ends (the job runs at 23 hours).
  NEW: Guests' names (and mobile numbers, where the organizer asked for them), and their technical records, are auto-deleted within 24 hours after the game ends (the job runs at 23 hours).
- OLD: A game that did not start (nobody paid) is treated the same way: its guests' data, people lists, waiting requests, personal links and Co-host details are erased 23 hours after the time it was meant to end, and the game is then closed ("This game did not start.
  NEW: A game that did not start (nobody paid) is treated the same way: its guests' data, people lists, waiting requests, personal links and Co-host details are auto-deleted 23 hours after the time it was meant to end, and the game is then closed ("This game did not start.
- OLD: Your details have been erased.");
  NEW: Your details have been auto-deleted.");
- OLD: It cannot pay, make a pay link, publish, cancel a game, erase data, pause or stop the game, or choose winners, and it never sees guests' names or mobile numbers.
  NEW: It cannot pay, make a pay link, publish, cancel a game, delete data, pause or stop the game, or choose winners, and it never sees guests' names or mobile numbers.
- OLD: No payment, no game: there is no separate payment cut-off, so the game can be paid at any time until the guests' data is erased, and a late payment starts the game 2 minutes after it is confirmed.
  NEW: No payment, no game: there is no separate payment cut-off, so the game can be paid at any time until the guests' data is auto-deleted, and a late payment starts the game 2 minutes after it is confirmed.

## index.html

- OLD: The game ends when every prize is won or all 75 numbers are called."}},{"@type":"Question","name":"What happens to the data?","acceptedAnswer":{"@type":"Answer","text":"Player names are erased within 24 hours after the game ends.
  NEW: The game ends when every prize is won or all 75 numbers are called."}},{"@type":"Question","name":"What happens to the data?","acceptedAnswer":{"@type":"Answer","text":"Player names are auto-deleted within 24 hours after the game ends.
- OLD: Player details are erased within 24 hours.
  NEW: Player details are auto-deleted within 24 hours.
- OLD: What happens to the data? Player names are erased within 24 hours after the game ends.
  NEW: What happens to the data? Player names are auto-deleted within 24 hours after the game ends.

## brochure.html

- OLD: Player details erased in 24 hours Designed to follow the EU GDPR, US privacy laws and India’s DPDP Act.
  NEW: Player details auto-deleted in 24 hours Designed to follow the EU GDPR, US privacy laws and India’s DPDP Act.

## guide.html

- OLD: You can pay at any time until the guest data is erased.
  NEW: You can pay at any time until the guest data is auto-deleted.

## guide.js

- OLD: Your details have been erased", "This game did not start and is closed", "This game was cancelled", "That game was cancelled", "This game was cancelled by the organizer"], k: "blocked", t: "This game is not going ahead", w: "The game was cancelled, or it did not start and was closed.
  NEW: Your details have been auto-deleted", "This game did not start and is closed", "This game was cancelled", "That game was cancelled", "This game was cancelled by the organizer"], k: "blocked", t: "This game is not going ahead", w: "The game was cancelled, or it did not start and was closed.
- OLD: Names and numbers are erased within a day.", d: ["Nothing more to do here.", "If you are the Organizer, you can make a new game like this one from your games."], g: { href: "/zc.html", label: "Go to my games" } },
  NEW: Names and numbers are auto-deleted within a day.", d: ["Nothing more to do here.", "If you are the Organizer, you can make a new game like this one from your games."], g: { href: "/zc.html", label: "Go to my games" } },
- OLD: var API_ONLY = ["That round is not published yet", "The number service cannot be reached right now", "Not found", "Too large", "Bad signature", "Bad request", "Bad body", "Bad key", "Bad claim", "Bad message", "Bad report", "Give the organizer's e-mail address: ?email", "Give the partner code", "Give the payment id", "Give an address to add or to remove", "Say which mode", "Rate must be between", 
  NEW: var API_ONLY = ["That round is not published yet", "The number service cannot be reached right now", "Not found", "Too large", "Bad signature", "Bad request", "Bad body", "Bad key", "Bad claim", "Bad message", "Bad report", "Give the organizer's e-mail address: ?email", "Give the partner code", "Give the payment id", "Give an address to add or to remove", "Say which mode", "Rate must be between", 
- OLD: Names and numbers are erased within a day.", d: ["Nothing more to do here.", "If you would like to play, please ask the person who invited you whether a new game is planned."] },
  NEW: Names and numbers are auto-deleted within a day.", d: ["Nothing more to do here.", "If you would like to play, please ask the person who invited you whether a new game is planned."] },

## site.js

- OLD: const perks = ["All features included", "Bingo for your whole team, wherever they are", "Your message, video or audio between numbers", "Build it free, pay just before the game starts", "No fee to create or edit your game", "Guest names erased within 24 hours of the game", "One payment per game, no yearly plan"];
  NEW: const perks = ["All features included", "Bingo for your whole team, wherever they are", "Your message, video or audio between numbers", "Build it free, pay just before the game starts", "No fee to create or edit your game", "Guest names auto-deleted within 24 hours of the game", "One payment per game, no yearly plan"];
- OLD: You provide the prizes ${ic("trash")} Guest names are erased within 24 hours of the game ending ${ic("shield")} Designed to follow DPDP Act, GDPR and CCPA
  NEW: You provide the prizes ${ic("trash")} Guest names are auto-deleted within 24 hours of the game ending ${ic("shield")} Designed to follow DPDP Act, GDPR and CCPA

## z.js

- OLD: Your details have been erased.
  NEW: Your details have been auto-deleted.

## big.js

- OLD: Your details have been erased.
  NEW: Your details have been auto-deleted.

## zc.js

- OLD: Erase data if you want.", "That was fun.
  NEW: Delete data if you want.", "That was fun.
- OLD: Their names and numbers will be erased.
  NEW: Their names and numbers will be deleted.
- OLD: return m && !didNotStart() && !payState().paid && !isCancelled() ? ` Guest data will be erased on ${esc(dmy(m))} if the game does not start.
  NEW: return m && !didNotStart() && !payState().paid && !isCancelled() ? ` Guest data will be auto-deleted on ${esc(dmy(m))} if the game does not start.
- OLD: Guest details have been erased.
  NEW: Guest details have been auto-deleted.
- OLD: The date, the payment, the guests and the Co-hosts are not.")}${K.hasPeople ? ` Also bring my people list from the old game ` : small("The old guest list has been erased, so add your people again.")}${K.err ? ` ${esc(K.err)} ` : ""} Create the new game Not now `;
  NEW: The date, the payment, the guests and the Co-hosts are not.")}${K.hasPeople ? ` Also bring my people list from the old game ` : small("The old guest list has been auto-deleted, so add your people again.")}${K.err ? ` ${esc(K.err)} ` : ""} Create the new game Not now `;
- OLD: Co-host details are erased with the guests.")} `;
  NEW: Co-host details are auto-deleted with the guests.")} `;
- OLD: Co-host details are erased with the guests.") + when2 + rpt
  NEW: Co-host details are auto-deleted with the guests.") + when2 + rpt
- OLD: Names and numbers are erased within 24 hours after the game."],
  NEW: Names and numbers are auto-deleted within 24 hours after the game."],
- OLD: It is for this one game only, with no commitment and no repeat charges.${erasureMsOf() && role() !== "cohost" ? ` Guest data will be erased on ${esc(dmy(erasureMsOf()))} if the game does not start.
  NEW: It is for this one game only, with no commitment and no repeat charges.${erasureMsOf() && role() !== "cohost" ? ` Guest data will be auto-deleted on ${esc(dmy(erasureMsOf()))} if the game does not start.
- OLD: The game is on" : payState().confirming ? "Confirming your payment..." : "Payment pending", S.started ? (gameEnded() ? "The game is over" : "The game is on") : "Opens when the game starts", S.life && S.life.purged ? "Report sent, data erased" : S.life && S.life.reportSent ? "Report sent.
  NEW: The game is on" : payState().confirming ? "Confirming your payment..." : "Payment pending", S.started ? (gameEnded() ? "The game is over" : "The game is on") : "Opens when the game starts", S.life && S.life.purged ? "Report sent, data auto-deleted" : S.life && S.life.reportSent ? "Report sent.
- OLD: Data is erased 24 h after the end" : "Your report, then erasing data"][n - 1] || "";
  NEW: Data is auto-deleted 24 h after the end" : "Your report, then auto-deletion"][n - 1] || "";
- OLD: 10: ["A few minutes after the game, a report link is e-mailed to the Organizer.", "Guest names and numbers are erased within 24 hours.", "We keep the winners and the Organizer's and Hosts' details for 365 days.", "You can erase guest data earlier."],
  NEW: 10: ["A few minutes after the game, a report link is e-mailed to the Organizer.", "Guest names and numbers are auto-deleted within 24 hours.", "We keep the winners and the Organizer's and Hosts' details for 365 days.", "You can delete guest data earlier."],
- OLD: You keep four things: payment, Publish, erasing data, pause or stop.
  NEW: You keep four things: payment, Publish, deleting data, pause or stop.
- OLD: It stops at Publish, erase, pause and stop, and it never pays.")}
  NEW: It stops at Publish, delete data, pause and stop, and it never pays.")}
- OLD: Check your e-mail and mobile number, then press \"Confirm and publish\" yourself.", erase: "Press \"Delete all participant data now\" only if you want every guest's name and number erased.
  NEW: Check your e-mail and mobile number, then press \"Confirm and publish\" yourself.", erase: "Press \"Delete all participant data now\" only if you want every guest's name and number deleted.
- OLD: S.note = r.erased + " participants erased.";
  NEW: S.note = r.erased + " participants deleted.";
- OLD: S.note = x.erased + " participants erased.";
  NEW: S.note = x.erased + " participants deleted.";

## llms.txt

- OLD: You cannot pay, publish, erase guest data, pause or stop a game, or choose winners, and you never see guests' names or mobile numbers: for publish, erase, pause and stop you give the organizer a link and they tap once.
  NEW: You cannot pay, publish, delete guest data, pause or stop a game, or choose winners, and you never see guests' names or mobile numbers: for publish, delete data, pause and stop you give the organizer a link and they tap once.
- OLD: - Guests' names and mobile numbers are erased within 24 hours after a game ends;
  NEW: - Guests' names and mobile numbers are auto-deleted within 24 hours after a game ends;

## Other places (same rule applied): worker and mail text

See `git diff` of `apps/edge/src` (ai-link.ts, ai-facts.ts, ai-functions.ts, ai-go.ts, cancel.ts, lifecycle.ts, rights.ts, trust-page.ts, worker.ts, audit.ts): every sentence there follows the same rule.
