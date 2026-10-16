# Product Context

## Purpose
LeadGen OS is an internal B2B lead-generation system for the owner's AI/automation offer. It should find real companies with evidence-backed reasons for contact, identify relevant decision-makers and usable contacts, produce context-aware outreach, and require human approval before sending.

## Desired outcome
`Company + actionable signal → official website → relevant decision-maker → best evidenced contact → personalized email → Ready → human approval → queue → safe sending → follow-up`

Three entry modes:
1. **Business Signals:** identify companies showing meaningful business events/opportunities; chosen ICP/industry is a hard constraint when configured.
2. **Direct AI Need:** explicit current AI/automation demand; **no mandatory industry filter**. Include vacancies, procurement, projects, contractor demand and semantically equivalent intent, without a keyword whitelist.
3. **Imported Base:** user-supplied companies; enrich and qualify using the common downstream. Do not manufacture a current buying signal.

## Lead quality is not merely Ready count
Measure: verified company and domain; evidence of why now; confirmed relevant people; correctly attributed personal corporate emails; department/general fallbacks; contact usability; quality of personalization; source diversity; time/cost per useful lead; false attribution. A general `info@` fallback may yield Ready but is **not** success at finding a decision-maker.

## Concepts
- **Evidence:** compact source URL/type, relevant excerpt, capture time and confidence.
- **ContactBundle:** researched people, roles, profiles, contacts and confidence.
- **LPR:** decision-maker/process owner relevant to the particular business need, not a rigid title whitelist.
- **Ready:** qualified outreach eligible for review; not automatic sending.
- **Email confidence:** `VERIFIED` (direct public person-email linkage), `HIGH_CONFIDENCE` (strong corroboration without ownership claim), `PREDICTED` (unconfirmed hypothesis, not automatic recipient), `REJECTED` (contradicted).

## Current evidence and limitations (reported, not revalidated)
On a fixed eight-company sample: confirmed people **3→6**, confirmed personal emails **2→3**, usable email contacts **4→5**, Ready **4→5**, general-only **2→2**, actions/company **5.38→8**. Reported specific result: Спецмаш-СНГ / commercial director Дмитрий Полькин / publicly evidenced personal corporate email. This is not independent verification.

Research quality remains **NOT READY**. Direct AI Need non-HH: 15 assessed materials, 0 companies with confirmed current buying intent. Reported OpenAI `429 credit_balance_exhausted` interrupted wider benchmark. Qwen live quality is unmeasured. Telegram-first is a product direction; full operational bot not verified.

Latest repository investigation is recorded in `.ai/oct16-research-context-report.md`: provider failure freshly reproduced on one production input, bounded state/context/routing fixes regression-tested, no new live quality improvement claimed. Consult `.ai/current-task.md` for transient rollout status rather than assuming these historical counts describe today.
