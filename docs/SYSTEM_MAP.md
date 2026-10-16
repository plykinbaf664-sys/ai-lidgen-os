# System Map

## 1. Business Signals
`UI/API → lead-discovery-engine → company + signal + ICP verification → researchCompany → outreach → Ready`
Keep company identity, official domain, signal source and freshness distinct. Segment matching must not be inferred from the signal alone. Inspect production path and stage-loss reasons when results degrade.

## 2. Direct AI Need
`UI/API → source-campaign-runner → ai-hiring-live-canary → direct-ai-need-agent planning/assessment + search router → company/domain resolution → common researchCompany → outreach → Ready`
No mandatory sector filter. Non-HH materials must not be rejected solely because a structured employer field is missing. Conversely, an article about an AI supplier or a generic procurement portal is not proof that a specific B2B buyer has current intent. Track source/provider, evidence and rejection reason.

## 3. Imported Base
`file → contact-import validation/dedup → normalized company → source-campaign-runner → common research/outreach → review`
Preserve history, idempotency, sent-contact protection and user consent boundaries. A company without credible reason for outreach must not receive fabricated intent.

## 4. Company/people research
`researchCompany → iterative-people-research → search/open → research-evidence → people-discovery/person-scoring → personal-email-research/contact-quality → ContactBundle`
Use facts learned in earlier rounds to plan subsequent queries. Confirm person-company-role attribution; avoid attaching adjacent employees' titles or email. Distinguish personal verified/high confidence/predicted from general/department fallback. Stop on sufficient quality or diminishing returns.

## 5. Outreach and transaction lifecycle
`ContactBundle + signal → first-email-ai-generator/email-outreach-builder → Ready → manual approval → outreach-queue → outreach-processor → email-provider/smtp-client → follow-up`
One intended recipient per outreach; alternative emails must not become duplicate queue entries. Test single, bulk and approve-all, double-click idempotency, queue deduplication, counters and sender dry-run. Real SMTP is an explicit side-effect boundary.

## 6. Telegram-first direction
Cards/notifications reportedly exist. End-to-end operational bot not established. Do not mark complete without live evidence.
