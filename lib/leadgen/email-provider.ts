import type { OutreachQueueEntry } from "@/lib/leadgen/types";
import { appendToSentMailbox } from "./imap-sent-client";
import {
  getSmtpConfigFromEnv,
  sendSmtpEmail,
  verifySmtpConnection,
} from "./smtp-client";
import { resolveDeliveryRecipient } from "./outreach-policy";
import { formatUnknownError } from "./error-format";

export type EmailSendResult =
  | {
      ok: true;
      provider: string;
      provider_message_id: string;
      subject: string;
      smtp_response: string;
      sent_copy_saved_at: string | null;
      sent_copy_error: string | null;
    }
  | {
      ok: false;
      provider: string;
      error: string;
    };

export interface EmailProvider {
  id: string;
  label: string;
  validateConnection(): Promise<{ ok: boolean; message: string }>;
  getProviderStatus(): Promise<{ connected: boolean; label: string }>;
  sendEmail(entry: OutreachQueueEntry): Promise<EmailSendResult>;
}

export class DisconnectedEmailProvider implements EmailProvider {
  id = "disconnected";
  label = "Почтовый канал не подключён";

  async validateConnection() {
    return {
      ok: false,
      message: "Почтовый канал не подключён. Реальная отправка отключена.",
    };
  }

  async getProviderStatus() {
    return {
      connected: false,
      label: this.label,
    };
  }

  async sendEmail(): Promise<EmailSendResult> {
    return {
      ok: false,
      provider: this.id,
      error: "Почтовый канал не подключён. Письмо не отправлено.",
    };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  id = "yandex_smtp";
  label = "Яндекс SMTP";

  private isTestMode() {
    return process.env.EMAIL_TEST_MODE?.trim().toLowerCase() !== "false";
  }

  private getTestRecipient(): string {
    const recipient = process.env.EMAIL_TEST_RECIPIENT?.trim();
    if (!recipient) {
      throw new Error("EMAIL_TEST_RECIPIENT не задан.");
    }
    return recipient;
  }

  async validateConnection() {
    try {
      if (this.isTestMode()) this.getTestRecipient();
      await verifySmtpConnection(getSmtpConfigFromEnv());
      return {
        ok: true,
        message: "SMTP-соединение и авторизация подтверждены.",
      };
    } catch (error) {
      return {
        ok: false,
        message: formatUnknownError(error, "SMTP недоступен."),
      };
    }
  }

  async getProviderStatus() {
    const validation = await this.validateConnection();
    return {
      connected: validation.ok,
      label: validation.ok ? this.label : `${this.label}: ${validation.message}`,
    };
  }

  async sendEmail(entry: OutreachQueueEntry): Promise<EmailSendResult> {
    try {
      const recipient = resolveDeliveryRecipient({
        testMode: this.isTestMode(),
        testRecipient: this.isTestMode() ? this.getTestRecipient() : null,
        actualRecipient: entry.email,
      });

      const message = {
        to: recipient,
        subject: this.isTestMode()
          ? `[TEST → ${entry.email}] ${entry.subject}`
          : entry.subject,
        body: entry.body,
        inReplyTo:
          entry.message_kind === "follow_up" ? entry.parent_smtp_message_id : null,
        references:
          entry.message_kind === "follow_up" && entry.parent_smtp_message_id
            ? [entry.parent_smtp_message_id]
            : [],
      };
      const receipt = await sendSmtpEmail(message);
      let sentCopySavedAt: string | null = null;
      let sentCopyError: string | null = null;
      try {
        await appendToSentMailbox({
          rawMessage: receipt.rawMessage,
          messageId: receipt.messageId,
          sentAt: new Date(),
        });
        sentCopySavedAt = new Date().toISOString();
      } catch (error) {
        sentCopyError = formatUnknownError(error, "Не удалось сохранить копию в Sent.");
      }

      return {
        ok: true,
        provider: this.id,
        provider_message_id: receipt.messageId,
        subject: message.subject,
        smtp_response: receipt.response,
        sent_copy_saved_at: sentCopySavedAt,
        sent_copy_error: sentCopyError,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        error: formatUnknownError(error, "SMTP-отправка завершилась ошибкой."),
      };
    }
  }
}

export function createEmailProvider(): EmailProvider {
  return new SmtpEmailProvider();
}
