import fs from "node:fs/promises";
import path from "node:path";

const resultPath = path.resolve(".ai", "smtp-test-send-result.json");

async function main() {
  try {
    await fs.access(resultPath);
    throw new Error(
      "Одноразовая SMTP-проверка уже выполнялась: повторная отправка заблокирована.",
    );
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const { getSmtpConfigFromEnv, sendSmtpEmail, verifySmtpConnection } =
    await import("../lib/leadgen/smtp-client.ts");

  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL",
    "SMTP_FROM_NAME",
    "EMAIL_TEST_MODE",
    "EMAIL_TEST_RECIPIENT",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Отсутствуют обязательные переменные: ${missing.join(", ")}`);
  }
  if (process.env.EMAIL_TEST_MODE.trim().toLowerCase() !== "true") {
    throw new Error("EMAIL_TEST_MODE должен быть true.");
  }

  const config = getSmtpConfigFromEnv();
  await verifySmtpConnection(config);

  const now = new Date();
  const recipient = process.env.EMAIL_TEST_RECIPIENT.trim();
  const entry = {
    email: recipient,
    subject: "Leadgen OS — тест SMTP",
    body: [
      "Это единственное тестовое письмо Leadgen OS.",
      "",
      `Время проверки: ${now.toISOString()}`,
      "Реальные лиды в этой проверке не используются.",
    ].join("\n"),
  };

  const queue = {
    status: "sending",
    send_attempts: 1,
  };
  const startedAt = new Date();
  let sendResult;
  try {
    const receipt = await sendSmtpEmail({
      to: recipient,
      subject: entry.subject,
      body: entry.body,
      config,
    });
    sendResult = {
      ok: receipt.accepted,
      provider: "yandex_smtp_test",
      provider_message_id: receipt.messageId,
      error: null,
    };
  } catch (error) {
    sendResult = {
      ok: false,
      provider: "yandex_smtp_test",
      provider_message_id: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const finishedAt = new Date();

  const report = {
    smtp_connection: "connected_and_authenticated",
    sent_at: finishedAt.toISOString(),
    send_duration_ms: finishedAt.getTime() - startedAt.getTime(),
    message_id: sendResult.ok ? sendResult.provider_message_id : null,
    from: process.env.SMTP_FROM_EMAIL.trim(),
    recipient,
    queue_status: sendResult.ok ? "sent" : "failed",
    send_attempts: queue.send_attempts,
    provider: sendResult.provider,
    error: sendResult.ok ? null : sendResult.error,
  };

  await fs.mkdir(path.dirname(resultPath), { recursive: true });
  await fs.writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!sendResult.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      smtp_connection: "failed_or_not_tested",
      queue_status: "not_sent",
      error: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
