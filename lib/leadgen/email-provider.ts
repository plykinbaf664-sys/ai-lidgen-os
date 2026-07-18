import type { OutreachQueueEntry } from "@/lib/leadgen/types";
import {
  getSmtpConfigFromEnv,
  sendSmtpEmail,
  verifySmtpConnection,
} from "./smtp-client";
import { resolveDeliveryRecipient } from "./outreach-policy";

export type EmailSendResult =
  | {
      ok: true;
      provider: string;
      provider_message_id: string;
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
        message: error instanceof Error ? error.message : String(error),
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

      const receipt = await sendSmtpEmail({
        to: recipient,
        subject: this.isTestMode()
          ? `[TEST → ${entry.email}] ${entry.subject}`
          : entry.subject,
        body: entry.body,
      });

      return {
        ok: true,
        provider: this.id,
        provider_message_id: receipt.messageId,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createEmailProvider(): EmailProvider {
  return new SmtpEmailProvider();
}
