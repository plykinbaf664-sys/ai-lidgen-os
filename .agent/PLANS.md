# ExecPlans — LeadGen OS

Use a plan for multi-module research architecture changes, persistence changes, provider migrations, lifecycle/state-machine changes or risky production behavior. Do not create one for every small edit.

Store living plans under `.agent/plans/`. Keep them brief and revise them when traces disprove the original hypothesis.

## Plan template
```markdown
# Goal and observable acceptance
## Baseline evidence and reproducible failure
## Affected flow and source files
## Invariants and side-effect boundaries
## Hypothesis and implementation approach
## Budget/provider/data implications
## Verification (focused → live → lifecycle)
## Progress / deviations
## Results (before → after) and remaining limitations
```

Example suitable plan: improve Direct AI Need non-HH buyer-intent retrieval without relaxing company/domain verification, measured on a fixed sample and bounded live run. Do not use a plan as permission to replace stable unrelated modules.
