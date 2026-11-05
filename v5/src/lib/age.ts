/**
 * Carevia accounts are for adults (FAQ: "Adults aged 18 and over can create an account").
 * Children are booked by a parent or guardian, so they never get their own login.
 *
 * Used in two places:
 *  - the sign-up form, to show a friendly message straight away
 *  - server/auth.ts, which is the check that actually counts (the form can be bypassed)
 *
 * @param dateOfBirth the value of <input type="date">, always "YYYY-MM-DD"
 * @param today       defaults to now; passed in so the rule can be tested on any date
 * @returns true if the person has had their 18th birthday on or before `today`
 */
export function isAdult(dateOfBirth: string, today = new Date()): boolean {
  // TODO(human): implement the 18+ rule.
  // Placeholder so the rest of the demo runs: it currently lets everyone through.
  void dateOfBirth
  void today
  return true
}
