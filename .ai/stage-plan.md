Stage 1 — Opportunity Intelligence Engine  
Acceptance summary: Add Opportunity Engine before lead creation with Opportunity Score, Opportunity Type, should_create_lead, business_reasoning, why_now, and why_this_company surfaced in diagnostics.

Stage 2 — Opportunity Validation Rules  
Acceptance summary: Score real commercial events highly and reject generic company information, product pages, blogs, careers/about/pricing pages, and weak generic AI/automation/workflow signals.

Stage 3 — Opportunity Gate  
Acceptance summary: Make Opportunity Engine mandatory before production lead creation; when should_create_lead=false, skip downstream discovery, prioritization, saving, and keep the company only in diagnostics/skipped.

Stage 4 — Explainable Opportunity  
Acceptance summary: Every approved lead must explain the decision with score, type, reasoning, why now, why this company, positive/negative factors, missing information, and recommended action across diagnostics, campaign details, and Telegram card.

Stage 5 — Discovery Quality Audit  
Acceptance summary: Validate and tune only rules, weights, thresholds, and diagnostics so only companies with real commercial opportunity become leads, while generic pages and weak signals are rejected.
