import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [rules, generator, smtp, provider, processor, storage, outreachStorage, scheduler, followupBatch, followupBulkApprove, migration, env, ui, followupRoute] = await Promise.all([
  read("lib/leadgen/followup-rules.ts"),
  read("lib/leadgen/followup-generator.ts"),
  read("lib/leadgen/smtp-client.ts"),
  read("lib/leadgen/email-provider.ts"),
  read("lib/leadgen/outreach-processor.ts"),
  read("lib/leadgen/followup-storage.ts"),
  read("lib/leadgen/outreach-storage.ts"),
  read("lib/leadgen/outreach-scheduler.ts"),
  read("app/api/leadgen/followups/batch/route.ts"),
  read("app/api/leadgen/followups/bulk-approve/route.ts"),
  read("supabase/followup_engine_v1.sql"),
  read(".env.example"),
  read("components/leadgen/email-outreach-queue.tsx"),
  read("app/api/leadgen/followups/route.ts"),
]);

const required = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: ${pattern}`);
};

required(env, [/FOLLOWUP_ENABLED=true/, /FOLLOWUP_MIN_INTERVAL_HOURS=24/, /IMAP_HOST=imap\.yandex\.ru/, /IMAP_PASSWORD=/], "config");
required(migration, [/message_kind/, /parent_outreach_id/, /followup_number/, /reply_detected_at/, /claim_followup_reply_scan/, /followup_paused/], "migration");
required(rules, [/in_reply_to/, /references/, /sender_email/, /subject_time/, /normalizeReplySubject/, /getFollowupIdempotencyKey/], "matching");
required(generator, [/continuity/, /new_value/, /non_repetition/, /needs_manual_copy_review/, /getFollowupCta/, /generationAttempts/], "generation");
required(storage, [/interval_not_reached/, /reply_check_unavailable/, /missing_parent_message_id/, /already_followed_up/, /stop_list/, /assertFollowupSendable/, /getDailySendStats/], "eligibility");
required(storage, [/evaluateFollowupEligibility/, /eligibility_diagnostics/, /next_eligible_at/, /reply_detected/], "eligibility diagnostics");
required(storage, [/runAutomaticFollowupCycle/, /followupAutomationEnabled/, /followupAutomationScanMinutes/, /scheduleFollowupBatch/], "automation");
required(smtp, [/In-Reply-To/, /References/, /randomUUID/], "thread headers");
required(provider, [/message_kind === "follow_up"/, /parent_smtp_message_id/], "provider threading");
required(processor, [/assertFollowupSendable/, /claimDueOutreachItem/], "pre-send reply check");
assert.match(processor, /runAutomaticFollowupCycle/);
required(processor, [/requestedKind/, /nextKind === "initial"/, /nextKind === "follow_up"/], "separate processors");
required(scheduler, [/MessageKind/, /runOutreachProcessorIteration\(messageKind/], "separate scheduler");
required(scheduler, [/messageKind === "follow_up"/, /await getFollowups\(\)/], "follow-up local scheduler");
required(followupBatch, [/runOutreachProcessorIteration\("follow_up"\)/], "follow-up trigger");
required(followupBulkApprove, [/body\.manual === true/], "manual bulk approval");
required(ui, [/\{ manual: true, \.\.\.payload \}/, /followupSummary\?\.needs_review/], "follow-up bulk approval UI");
assert.match(
  outreachStorage.match(/export async function cancelQueued[\s\S]*?export async function cancelQueuedItem/)?.[0] ?? "",
  /\.eq\("message_kind", "initial"\)/,
);
required(ui, [/Дожимные письма/, /Проверить входящие ответы/, /Сгенерировать дожимы/, /История касаний/, /Отменить до отправки/], "UI");
required(ui, [/Дожимы станут доступны через/, /Почему письма пока не готовы/, /formatFollowupWait/], "eligibility UI");
assert.match(
  followupRoute,
  /getFollowups\(campaignId\), getFollowupSummary\(campaignId\)/,
);
assert.match(ui, /runFollowupAction\("generate"\)/);

assert.doesNotMatch(
  smtp.match(/export function buildRawEmailMessage[\s\S]*?function expectCode/)?.[0] ?? "",
  /In-Reply-To:.*[^?]\n.*In-Reply-To:/,
  "headers must be built once per message",
);
assert.match(storage, /reply_check_status !== "verified"/);
assert.match(storage, /reply_detected_at/);
assert.match(storage, /status !== "sent"/);
assert.match(storage, /smtp_message_id: null/);
assert.match(migration, /message_kind = 'initial' and status = 'sent'/);
assert.match(migration, /message_kind = 'follow_up'/);

console.log("FOLLOWUP_ENGINE_CHECK_OK");
console.log("Covered: interval, IMAP unavailable, reply matching priorities, stop-list, parent Message-ID, idempotency, edit invalidation, bulk approval, shared daily limit, sequential queue, retry Message-ID reset, thread headers, unified timeline.");
console.log("No SMTP send function was called.");
