import tls from "node:tls";
import { lookup } from "node:dns/promises";
import { parseReferences, type IncomingHeader } from "./followup-rules";

const CONNECTION_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_MESSAGES = 500;
const FETCH_BATCH = 100;

export type ImapDiagnosticStatus =
  | "not_configured"
  | "dns_error"
  | "connection_timeout"
  | "connection_error"
  | "tls_error"
  | "auth_error"
  | "mailbox_error"
  | "protocol_error"
  | "connected";

export type ImapConnectionDiagnostic = {
  status: ImapDiagnosticStatus;
  message: string;
  env_loaded: boolean;
  host: string;
  port: number;
  secure: boolean;
  user_configured: boolean;
  password_configured: boolean;
  dns_resolved: boolean;
  socket_connected: boolean;
  tls_connected: boolean;
  authenticated: boolean;
  mailbox_opened: boolean;
};

class ImapStageError extends Error {
  constructor(public readonly status: ImapDiagnosticStatus, message: string) {
    super(message);
    this.name = "ImapStageError";
  }
}

type ImapReplyConfig = {
  host: string;
  port: number;
  secure: true;
  user: string;
  password: string;
};

function safeError(message: string) {
  return new Error(message.replace(/(password|login|authenticate)[^.]*/gi, "IMAP authorization"));
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function getImapReplyConfig(): ImapReplyConfig {
  const host = process.env.IMAP_HOST?.trim() || "imap.yandex.ru";
  const port = Number(process.env.IMAP_PORT?.trim() || "993");
  const secure = process.env.IMAP_SECURE?.trim().toLowerCase() !== "false";
  const user = process.env.IMAP_USER?.trim();
  const password = process.env.IMAP_PASSWORD;
  if (!secure) throw new Error("IMAP не настроен: требуется secure=true и TLS.");
  if (!user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("IMAP не настроен: задайте IMAP_USER и пароль приложения IMAP_PASSWORD.");
  }
  if (!user.includes("@")) {
    throw new Error("IMAP не настроен: IMAP_USER должен быть полным email-адресом.");
  }
  return { host, port, secure: true, user, password };
}

export function isImapReplyConfigured() {
  try {
    getImapReplyConfig();
    return true;
  } catch {
    return false;
  }
}

class ImapInboxSession {
  private socket: tls.TLSSocket;
  private connection: Promise<void>;
  private buffer = "";
  private lines: string[] = [];
  private wake: (() => void) | null = null;
  private counter = 0;

  constructor(
    private config: ImapReplyConfig,
    private onStage?: (stage: "socket" | "tls" | "auth" | "mailbox") => void,
  ) {
    const connectionOptions: tls.ConnectionOptions = {
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: true,
    };
    this.socket = tls.connect(connectionOptions);
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      const parts = this.buffer.split(/\r?\n/);
      this.buffer = parts.pop() ?? "";
      this.lines.push(...parts);
      this.wake?.();
    });
    this.connection = new Promise<void>((resolve, reject) => {
      let socketConnected = false;
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new ImapStageError("connection_timeout", "Таймаут соединения с IMAP."));
      }, CONNECTION_TIMEOUT_MS);
      this.socket.once("connect", () => {
        socketConnected = true;
        this.onStage?.("socket");
      });
      this.socket.once("secureConnect", () => {
        clearTimeout(timer);
        this.onStage?.("tls");
        resolve();
      });
      this.socket.once("error", () => {
        clearTimeout(timer);
        reject(new ImapStageError(
          socketConnected ? "tls_error" : "connection_error",
          socketConnected ? "Ошибка TLS при подключении к IMAP." : "Ошибка соединения с IMAP.",
        ));
      });
    });
  }

  private async line() {
    while (!this.lines.length) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ImapStageError("protocol_error", "Таймаут ответа IMAP.")), COMMAND_TIMEOUT_MS);
        const onError = () => { clearTimeout(timer); reject(safeError("IMAP недоступен.")); };
        this.socket.once("error", onError);
        this.wake = () => {
          clearTimeout(timer);
          this.socket.off("error", onError);
          this.wake = null;
          resolve();
        };
      });
    }
    return this.lines.shift() ?? "";
  }

  private async command(
    value: string,
    failureStatus: ImapDiagnosticStatus = "protocol_error",
    failureMessage = "IMAP-сервер отклонил команду.",
  ) {
    const tag = `f${++this.counter}`;
    this.socket.write(`${tag} ${value}\r\n`);
    const output: string[] = [];
    while (true) {
      const line = await this.line();
      output.push(line);
      if (line.startsWith(`${tag} `)) {
        if (!new RegExp(`^${tag} OK\\b`, "i").test(line)) {
          throw new ImapStageError(failureStatus, failureMessage);
        }
        return output;
      }
    }
  }

  async connect() {
    await this.connection;
    if (!/^\* OK\b/i.test(await this.line())) {
      throw new ImapStageError("protocol_error", "IMAP-сервер не подтвердил соединение.");
    }
    await this.command(
      `LOGIN ${quote(this.config.user)} ${quote(this.config.password)}`,
      "auth_error",
      "Ошибка авторизации IMAP. Проверьте полный email и пароль приложения.",
    );
    this.onStage?.("auth");
    await this.command(
      'SELECT "INBOX"',
      "mailbox_error",
      "Не удалось открыть INBOX.",
    );
    this.onStage?.("mailbox");
  }

  async readHeaders(since: Date): Promise<IncomingHeader[]> {
    const date = since.toUTCString().split(" ").slice(1, 4).join("-");
    const search = await this.command(`UID SEARCH SINCE ${date}`);
    const searchLine = search.find((line) => /^\* SEARCH\b/i.test(line));
    const uids = (searchLine?.match(/\d+/g) ?? []).slice(-MAX_MESSAGES);
    const results: IncomingHeader[] = [];
    for (let index = 0; index < uids.length; index += FETCH_BATCH) {
      const batch = uids.slice(index, index + FETCH_BATCH);
      const response = await this.command(
        `UID FETCH ${batch.join(",")} (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO REFERENCES FROM SUBJECT DATE)])`,
      );
      const blocks = response.join("\n").split(/\n(?=\* \d+ FETCH \()/i);
      for (const block of blocks) {
        const header = (name: string) => block.match(new RegExp(`^${name}:\\s*(.+(?:\\n[ \\t].+)*)$`, "im"))?.[1]
          ?.replace(/\n[ \t]+/g, " ").trim() ?? null;
        if (!/^\* \d+ FETCH \(/i.test(block)) continue;
        results.push({
          messageId: header("Message-ID"),
          inReplyTo: header("In-Reply-To"),
          references: parseReferences(header("References")),
          from: header("From"),
          subject: header("Subject"),
          date: header("Date"),
        });
      }
    }
    return results;
  }

  async close(graceful = true) {
    if (graceful) {
      try { await this.command("LOGOUT"); } catch { /* connection may already be closed */ }
    }
    this.socket.destroy();
  }
}

export async function fetchRecentInboxHeaders(since: Date) {
  const session = new ImapInboxSession(getImapReplyConfig());
  await session.connect();
  try {
    const headers = await session.readHeaders(since);
    return { headers, scanned: headers.length, limitedTo: MAX_MESSAGES };
  } finally {
    await session.close();
  }
}

export async function verifyImapReplyConnection() {
  const diagnostic = await diagnoseImapConnection();
  return {
    configured: diagnostic.status !== "not_configured",
    connected: diagnostic.status === "connected",
    message: diagnostic.message,
    diagnostic,
  };
}

export async function diagnoseImapConnection(): Promise<ImapConnectionDiagnostic> {
  const host = process.env.IMAP_HOST?.trim() || "imap.yandex.ru";
  const port = Number(process.env.IMAP_PORT?.trim() || "993");
  const secure = process.env.IMAP_SECURE?.trim().toLowerCase() !== "false";
  const userConfigured = Boolean(process.env.IMAP_USER?.trim());
  const passwordConfigured = Boolean(process.env.IMAP_PASSWORD);
  const diagnostic: ImapConnectionDiagnostic = {
    status: "not_configured",
    message: "IMAP не настроен.",
    env_loaded: userConfigured || passwordConfigured,
    host,
    port,
    secure,
    user_configured: userConfigured,
    password_configured: passwordConfigured,
    dns_resolved: false,
    socket_connected: false,
    tls_connected: false,
    authenticated: false,
    mailbox_opened: false,
  };

  let config: ImapReplyConfig;
  try {
    config = getImapReplyConfig();
  } catch (error) {
    diagnostic.message = error instanceof Error ? error.message : "IMAP не настроен.";
    return diagnostic;
  }

  try {
    await lookup(config.host, { all: true });
    diagnostic.dns_resolved = true;
  } catch {
    diagnostic.status = "dns_error";
    diagnostic.message = "Ошибка DNS: адрес IMAP-сервера не разрешён.";
    return diagnostic;
  }

  const session = new ImapInboxSession(config, (stage) => {
    if (stage === "socket") diagnostic.socket_connected = true;
    if (stage === "tls") diagnostic.tls_connected = true;
    if (stage === "auth") diagnostic.authenticated = true;
    if (stage === "mailbox") diagnostic.mailbox_opened = true;
  });
  try {
    await session.connect();
    diagnostic.status = "connected";
    diagnostic.message = "IMAP подключён.";
  } catch (error) {
    diagnostic.status = error instanceof ImapStageError ? error.status : "protocol_error";
    diagnostic.message = error instanceof Error ? error.message : "Ошибка IMAP.";
  } finally {
    await session.close(diagnostic.mailbox_opened);
  }
  return diagnostic;
}
