// Single source of truth for the free-tier limits Upgrade.jsx advertises.
//
// Before this file existed, "3 budgets / 2 goals free" was just text in
// Upgrade.jsx's FREE_LIMITS array — nothing in Budget.jsx or Goals.jsx ever
// read it, so a free user could create unlimited budgets and goals. The
// paywall was a pricing claim with no enforcement behind it: an unpaid user
// got Pro functionality for free, and a paying user got nothing Budgets/
// Goals-wise that a free one didn't already have.
//
// Import these constants everywhere the limit is either shown or enforced,
// so the two can never drift the way they just did.
export const FREE_BUDGET_LIMIT = 3;
export const FREE_GOAL_LIMIT = 2;
