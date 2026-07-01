# Check Result
package_manager=npm
final_check=true

## TypeScript
```
```
exit_code=0

## Lint
```

> ai-lidgen-os@0.1.0 lint
> eslint

```
exit_code=0

## Build
```

> ai-lidgen-os@0.1.0 build
> next build

▲ Next.js 16.2.6 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully in 8.4s
  Running TypeScript ...
  Finished TypeScript in 9.2s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/12) ...
  Generating static pages using 3 workers (3/12) 
  Generating static pages using 3 workers (6/12) 
  Generating static pages using 3 workers (9/12) 
✓ Generating static pages using 3 workers (12/12) in 729ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/leadgen/campaigns
├ ƒ /api/leadgen/campaigns/[id]
├ ƒ /api/leadgen/candidate-test
├ ƒ /api/leadgen/evidence-test
├ ƒ /api/leadgen/query-test
├ ƒ /api/leadgen/run
├ ƒ /api/leadgen/search-test
├ ƒ /api/leadgen/signal-pipeline-test
├ ƒ /api/test-storage
└ ○ /leadgen


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```
exit_code=0

CHECK_STATUS=OK
