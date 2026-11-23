/** The answer to "how would you ensure the server cannot modify or leak sensitive data?", in three sentences. */
export const SHORT_ANSWER = [
  "The server has no write tools: its only upstream client can send GET to a fixed list of Connecteam and ROLLER paths, a guard underneath blocks every other method and host, and the ROLLER key itself can be scoped to just those GET endpoints.",
  "Results are cut down to named fields, with contact, bank, card, tax file and Medicare details and medical flags removed before anything leaves the server.",
  "The API keys live only as Cloudflare secrets your team sets, and ClickUp connects with its own bearer token that you can rotate or revoke at any time.",
];
