import "server-only";

import {
  appendToSentMailbox,
  auditSentMailboxCopies,
  removeDuplicateSentMailboxCopies,
} from "@/lib/leadgen/imap-sent-client";
import { resolveDeliveryRecipient } from "@/lib/leadgen/outreach-policy";
import { buildRawEmailMessage } from "@/lib/leadgen/smtp-client";
import { createSupabaseServerClient } from "@/lib/supabase/client";

type SentRow = {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  sent_at: string;
  smtp_message_id: string;
  metadata: Record<string, unknown>;
};

export async function backfillSentMailboxCopies() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .select(
      "id,recipient_email,subject,body,sent_at,smtp_message_id,metadata",
    )
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .not("smtp_message_id", "is", null)
    .returns<SentRow[]>();
  if (error) throw error;

  const testMode = process.env.EMAIL_TEST_MODE?.trim().toLowerCase() !== "false";
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT?.trim() || null;
  let saved = 0;
  let alreadyPresent = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const row of data ?? []) {
    try {
      const recipient = resolveDeliveryRecipient({
        testMode,
        testRecipient,
        actualRecipient: row.recipient_email,
      });
      const { rawMessage } = buildRawEmailMessage({
        to: recipient,
        subject: testMode
          ? `[TEST → ${row.recipient_email}] ${row.subject}`
          : row.subject,
        body: row.body,
        messageId: row.smtp_message_id,
        sentAt: new Date(row.sent_at),
      });
      const result = await appendToSentMailbox({
        rawMessage,
        messageId: row.smtp_message_id,
        sentAt: new Date(row.sent_at),
      });
      if (result.already_present) alreadyPresent += 1;
      else saved += 1;
      const update = await supabase
        .from("leadgen_outreach_queue")
        .update({
          metadata: {
            ...(row.metadata ?? {}),
            sent_copy_saved_at: new Date().toISOString(),
            sent_copy_error: null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (update.error) throw update.error;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : String(caught);
      failed.push({ id: row.id, error: message });
      await supabase
        .from("leadgen_outreach_queue")
        .update({
          metadata: {
            ...(row.metadata ?? {}),
            sent_copy_error: message,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return {
    total: data?.length ?? 0,
    saved,
    already_present: alreadyPresent,
    failed,
  };
}

export async function deduplicateSentMailboxCopies() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .select("smtp_message_id")
    .eq("status", "sent")
    .not("smtp_message_id", "is", null)
    .returns<Array<{ smtp_message_id: string }>>();
  if (error) throw error;

  const messageIds = (data ?? []).map((row) => row.smtp_message_id);
  return removeDuplicateSentMailboxCopies(messageIds);
}

export async function auditSentMailboxArchive() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_outreach_queue")
    .select("smtp_message_id")
    .eq("status", "sent")
    .not("smtp_message_id", "is", null)
    .returns<Array<{ smtp_message_id: string }>>();
  if (error) throw error;

  const messageIds = (data ?? []).map((row) => row.smtp_message_id);
  const result = await auditSentMailboxCopies(messageIds);
  return {
    ...result,
    total: result.copies.reduce((sum, count) => sum + count, 0),
  };
}
