"""
The handful of facts in this file cannot be derived from the repository,
by definition: whether an LLC has been filed, what a competitor currently
charges, whether a domain has been bought. No script can browse the web or
check Yosef's email for a filing confirmation. Pretending otherwise — auto-
generating these into "live" reads the same way the June-2026 privacy-policy
date once claimed to be current — would be worse than labeling them clearly.

So: this file is a small, dated, hand-maintained config block, not a script
output. update-backup-docs.sh prints VERIFIED_ON in its output every run so
it's obvious when this needs a fresh look, and the PDFs themselves print it
too. Update the figures here (and VERIFIED_ON) when something actually
changes — a real payment made, a real price change noticed — not on a
schedule.

Dollar figures verified 2026-09-07 via each provider's own pricing page
(sourced live during that session, not estimated).
"""

VERIFIED_ON = "September 7, 2026"

COSTS = {
    "anthropic_funding": "$5 min. / $20+ suggested",
    "llc_formation": "$35 – $500 (avg. $132)",
    "duns_number": "$0",
    "apple_org_conversion": "$0 to convert*",
    "domain": "$12 – $20/yr",
    "support_inbox": "$0 (forwarding) or ~$6/mo",
    "revenuecat": "$0 until $2,500/mo revenue, then 1%",
    "app_store_agreements": "$0",
    "codemagic_build": "$0 (500 free min/mo)",
    "signup_open": "$0",
}

# Each item's `done` field is intentionally None where this file cannot
# know — a business step like "form the company" has no code signal at
# all. Where repo_facts.py CAN observe something real (e.g. whether
# appStoreConfig.js's placeholders are still blank), the generator scripts
# override these at build time instead of trusting a hand-set flag to stay
# accurate. See status_report.py / todo_next.py for exactly which ones.
ACTION_ITEMS = [
    {
        "n": "!", "title": "Fund the Anthropic account",
        "timeframe": "5 minutes — do this first", "cost": COSTS["anthropic_funding"],
        "urgent": True,
        "body": (
            "The AI Coach isn't broken — the Anthropic account runs out of credits "
            "periodically, and every Coach request fails until it's funded. Go to "
            "console.anthropic.com &rsaquo; Plans &amp; Billing and add funds. $5 is "
            "the minimum purchase; $20&ndash;$25 gives real runway before needing to "
            "think about it again."
        ),
    },
    {
        "n": 1, "title": "Form a company", "timeframe": "Weeks — start this first",
        "cost": COSTS["llc_formation"],
        "body": (
            "Apple will not accept a finance app from an individual developer account. "
            "Form an LLC or equivalent. Every step from #2 onward waits on this one. "
            "State filing fee only — Montana is cheapest at $35, Massachusetts highest "
            "at $500, national average is $132. File in the state actually lived/"
            "operated in, not the cheapest one."
        ),
    },
    {
        "n": 2, "title": "Get a D-U-N-S number, convert Apple Developer",
        "timeframe": "~2 weeks after step 1", "cost": COSTS["duns_number"],
        "body": (
            "Apply for a free D-U-N-S number from Dun &amp; Bradstreet using the new "
            "company. Once it arrives, convert the Apple Developer account from "
            "Individual to Organization at developer.apple.com. The existing $99/year "
            "Apple Developer membership just carries over — this conversion has no "
            "charge of its own."
        ),
    },
    {
        "n": 3, "title": "Buy a domain, set up support@", "timeframe": "Same day, anytime",
        "cost": COSTS["domain"],
        "body": (
            "A .com domain runs $12&ndash;$20/year at most registrars. Point Privacy "
            "Policy and Terms of Use at stable URLs on that domain. Forwarding support@ "
            "to an existing inbox is free with Cloudflare Email Routing; ~$6/month per "
            "user with Google Workspace to send mail as that address too."
        ),
    },
    {
        "n": 4, "title": "Set up RevenueCat and App Store Connect products",
        "timeframe": "1–2 days", "cost": COSTS["revenuecat"],
        "body": (
            "Create the App Store Connect listing (bundle ID app.yorbit), two "
            "auto-renewable subscriptions (app.yorbit.pro.monthly / "
            "app.yorbit.pro.yearly), a RevenueCat project with entitlement "
            "<b>pro</b>, and an offering linking both products. RevenueCat is free "
            "with no card required until $2,500/month in tracked revenue, then 1%."
        ),
        # overridden by repo_facts.app_store_config_state() at build time
        "auto_check": "app_store_and_revenuecat",
    },
    {
        "n": 5, "title": "Sign Agreements, Tax and Banking", "timeframe": "1–3 days",
        "cost": COSTS["app_store_agreements"],
        "body": (
            "In App Store Connect, under Agreements, Tax and Banking. Paid apps stay "
            "blocked until Apple has bank and tax details on file. Check eligibility "
            "for the Small Business Program while there — 15% commission instead of 30%."
        ),
    },
    {
        "n": 6, "title": "Run the iOS build on Codemagic", "timeframe": "Half a day",
        "cost": COSTS["codemagic_build"],
        "body": (
            "Codemagic is already connected to the repository with environment "
            "variables set. Once step 2 gives an Organization Apple Developer account, "
            "connect it under Team &rsaquo; Integrations &rsaquo; App Store Connect, "
            "then press Start new build. Personal accounts get 500 free macOS build "
            "minutes every month — one build won't come close to using it."
        ),
    },
    {
        "n": 7, "title": "Open signup, with abuse protection", "timeframe": "Half a day",
        "cost": COSTS["signup_open"],
        # overridden by repo_facts.feature_flags() at build time — this
        # became literally true on 2026-09-07 and the generator checks it.
        "auto_check": "signup_open",
        "body": (
            "Enable email confirmation and CAPTCHA in Supabase Auth before removing "
            "any signup allowlist, or scripts can create accounts that burn real "
            "Plaid and Anthropic usage."
        ),
    },
]
