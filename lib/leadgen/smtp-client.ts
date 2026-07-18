import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

type SmtpResponse = {
  code: number;
  message: string;
};

export type SmtpSendReceipt = {
  messageId: string;
  accepted: boolean;
  response: string;
};

const SMTP_TIMEOUT_MS = 15_000;

class SmtpResponseReader {
  private readonly socket: Duplex;
  private buffer = "";
  private lines: string[] = [];
  private waiter: (() => void) | null = null;
  private error: Error | null = null;

  constructor(socket: Duplex) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  private onData = (chunk: string) => {
    this.buffer += chunk;
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? "";
    this.lines.push(...parts);
    this.waiter?.();
  };

  private onError = (error: Error) => {
    this.error = error;
    this.waiter?.();
  };

  private onClose = () => {
    if (!this.error) {
      this.error = new Error("SMTP-соединение закрыто сервером.");
    }
    this.waiter?.();
  };

  detach() {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
  }

  async read(): Promise<SmtpResponse> {
    const responseLines: string[] = [];

    while (true) {
      while (this.lines.length === 0) {
        if (this.error) {
          throw this.error;
        }

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.waiter = null;
            reject(new Error("Таймаут ожидания ответа SMTP-сервера."));
          }, SMTP_TIMEOUT_MS);

          this.waiter = () => {
            clearTimeout(timer);
            this.waiter = null;
            resolve();
          };
        });
      }

      const line = this.lines.shift() ?? "";
      responseLines.push(line);
      const match = line.match(/^(\d{3})([ -])/);

      if (match?.[2] === " ") {
        return {
          code: Number(match[1]),
          message: responseLines.join("\n"),
        };
      }
    }
  }
}

function assertSafeHeader(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw new Error(`Некорректное значение ${label}.`);
  }
  return normalized;
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function encodeBase64Body(value: string): string {
  return Buffer.from(dotStuff(value), "utf8")
    .toString("base64")
    .match(/.{1,76}/g)!
    .join("\r\n");
}

function expectCode(
  response: SmtpResponse,
  expected: number | number[],
  action: string,
) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) {
    throw new Error(
      `${action}: SMTP-сервер вернул код ${response.code}.`,
    );
  }
}

async function waitForConnect(socket: net.Socket | tls.TLSSocket) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Таймаут подключения к SMTP-серверу."));
    }, SMTP_TIMEOUT_MS);
    const connectEvent =
      socket instanceof tls.TLSSocket ? "secureConnect" : "connect";

    socket.once(connectEvent, () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

class SmtpSession {
  private readonly config: SmtpConfig;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private reader: SmtpResponseReader | null = null;

  constructor(config: SmtpConfig) {
    this.config = config;
  }

  private async command(command: string): Promise<SmtpResponse> {
    if (!this.socket || !this.reader) {
      throw new Error("SMTP-сессия не открыта.");
    }
    this.socket.write(`${command}\r\n`);
    return this.reader.read();
  }

  private async greetAndAuth() {
    const greeting = await this.reader!.read();
    expectCode(greeting, 220, "Подключение");

    let ehlo = await this.command("EHLO localhost");
    expectCode(ehlo, 250, "EHLO");

    if (!this.config.secure && /\bSTARTTLS\b/i.test(ehlo.message)) {
      const startTls = await this.command("STARTTLS");
      expectCode(startTls, 220, "STARTTLS");

      this.reader!.detach();
      const secureSocket = tls.connect({
        socket: this.socket as net.Socket,
        servername: this.config.host,
      });
      await waitForConnect(secureSocket);
      this.socket = secureSocket;
      this.reader = new SmtpResponseReader(secureSocket);

      ehlo = await this.command("EHLO localhost");
      expectCode(ehlo, 250, "EHLO после STARTTLS");
    }

    const auth = await this.command("AUTH LOGIN");
    expectCode(auth, 334, "AUTH LOGIN");
    const user = await this.command(
      Buffer.from(this.config.user, "utf8").toString("base64"),
    );
    expectCode(user, 334, "SMTP user");
    const password = await this.command(
      Buffer.from(this.config.password, "utf8").toString("base64"),
    );
    expectCode(password, 235, "SMTP password");
  }

  async connect() {
    this.socket = this.config.secure
      ? tls.connect({
          host: this.config.host,
          port: this.config.port,
          servername: this.config.host,
        })
      : net.connect({
          host: this.config.host,
          port: this.config.port,
        });
    try {
      await waitForConnect(this.socket);
      this.reader = new SmtpResponseReader(this.socket);
      await this.greetAndAuth();
    } catch (error) {
      this.reader?.detach();
      this.socket.destroy();
      this.reader = null;
      this.socket = null;
      throw error;
    }
  }

  async verify() {
    await this.connect();
    await this.quit();
  }

  async send({
    to,
    subject,
    body,
  }: {
    to: string;
    subject: string;
    body: string;
  }): Promise<SmtpSendReceipt> {
    await this.connect();

    const fromEmail = assertSafeHeader(this.config.fromEmail, "from email");
    const fromName = assertSafeHeader(this.config.fromName, "from name");
    const recipient = assertSafeHeader(to, "recipient");
    const safeSubject = assertSafeHeader(subject, "subject");
    const domain = fromEmail.split("@")[1] || "localhost";
    const messageId = `<${randomUUID()}@${domain}>`;

    try {
      let response = await this.command(`MAIL FROM:<${fromEmail}>`);
      expectCode(response, 250, "MAIL FROM");
      response = await this.command(`RCPT TO:<${recipient}>`);
      expectCode(response, [250, 251], "RCPT TO");
      response = await this.command("DATA");
      expectCode(response, 354, "DATA");

      const message = [
        `From: ${encodeHeader(fromName)} <${fromEmail}>`,
        `To: <${recipient}>`,
        `Subject: ${encodeHeader(safeSubject)}`,
        `Message-ID: ${messageId}`,
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        encodeBase64Body(body),
      ].join("\r\n");

      this.socket!.write(`${message}\r\n.\r\n`);
      response = await this.reader!.read();
      expectCode(response, 250, "Отправка DATA");

      return {
        messageId,
        accepted: true,
        response: response.message,
      };
    } finally {
      await this.quit();
    }
  }

  private async quit() {
    if (!this.socket) {
      return;
    }

    try {
      if (!this.socket.destroyed && this.reader) {
        await this.command("QUIT");
      }
    } catch {
      // QUIT не влияет на уже подтверждённую SMTP-сервером отправку.
    } finally {
      this.reader?.detach();
      this.socket.destroy();
      this.reader = null;
      this.socket = null;
    }
  }
}

export function getSmtpConfigFromEnv(): SmtpConfig {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL",
    "SMTP_FROM_NAME",
  ] as const;

  for (const name of required) {
    if (!process.env[name]?.trim()) {
      throw new Error(`Переменная ${name} не задана.`);
    }
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT должен быть корректным TCP-портом.");
  }

  const secureValue = process.env.SMTP_SECURE!.trim().toLowerCase();
  if (!["true", "false"].includes(secureValue)) {
    throw new Error("SMTP_SECURE должен быть true или false.");
  }

  return {
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: secureValue === "true",
    user: process.env.SMTP_USER!.trim(),
    password: process.env.SMTP_PASSWORD!,
    fromEmail: process.env.SMTP_FROM_EMAIL!.trim(),
    fromName: process.env.SMTP_FROM_NAME!.trim(),
  };
}

export async function verifySmtpConnection(config = getSmtpConfigFromEnv()) {
  await new SmtpSession(config).verify();
}

export async function sendSmtpEmail({
  to,
  subject,
  body,
  config = getSmtpConfigFromEnv(),
}: {
  to: string;
  subject: string;
  body: string;
  config?: SmtpConfig;
}) {
  return new SmtpSession(config).send({ to, subject, body });
}
