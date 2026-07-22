import tls from "node:tls";

type ImapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

export type ImapAppendResult = {
  mailbox: string;
  already_present: boolean;
};

export type ImapDeduplicationResult = {
  mailbox: string;
  removed: number;
};

export type ImapAuditResult = {
  mailbox: string;
  copies: number[];
};

const IMAP_TIMEOUT_MS = 15_000;

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function getImapConfig(): ImapConfig {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const host =
    process.env.IMAP_HOST?.trim() ||
    (smtpHost?.startsWith("smtp.")
      ? `imap.${smtpHost.slice("smtp.".length)}`
      : "imap.yandex.com");
  const port = Number(process.env.IMAP_PORT?.trim() || "993");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password || !Number.isInteger(port)) {
    throw new Error("IMAP-конфигурация неполная.");
  }
  return { host, port, user, password };
}

class ImapSession {
  private readonly config: ImapConfig;
  private readonly socket: tls.TLSSocket;
  private buffer = "";
  private lines: string[] = [];
  private waiter: (() => void) | null = null;
  private tag = 0;

  constructor(config: ImapConfig) {
    this.config = config;
    this.socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
    });
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      const parts = this.buffer.split(/\r?\n/);
      this.buffer = parts.pop() ?? "";
      this.lines.push(...parts);
      this.waiter?.();
    });
  }

  private async waitForLine() {
    while (this.lines.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Таймаут ответа IMAP-сервера.")),
          IMAP_TIMEOUT_MS,
        );
        this.waiter = () => {
          clearTimeout(timer);
          this.waiter = null;
          resolve();
        };
        this.socket.once("error", (error) => {
          clearTimeout(timer);
          this.waiter = null;
          reject(error);
        });
      });
    }
    return this.lines.shift() ?? "";
  }

  private async readTagged(tag: string) {
    const response: string[] = [];
    while (true) {
      const line = await this.waitForLine();
      response.push(line);
      if (line.startsWith(`${tag} `)) return response;
    }
  }

  private nextTag() {
    this.tag += 1;
    return `a${this.tag}`;
  }

  private assertOk(tag: string, response: string[], action: string) {
    if (!response.some((line) => new RegExp(`^${tag} OK\\b`, "i").test(line))) {
      throw new Error(`${action}: IMAP-сервер отклонил команду.`);
    }
  }

  private async command(command: string, action: string) {
    const tag = this.nextTag();
    this.socket.write(`${tag} ${command}\r\n`);
    const response = await this.readTagged(tag);
    this.assertOk(tag, response, action);
    return response;
  }

  async connect() {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Таймаут подключения к IMAP-серверу.")),
        IMAP_TIMEOUT_MS,
      );
      this.socket.once("secureConnect", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const greeting = await this.waitForLine();
    if (!/^\* OK\b/i.test(greeting)) {
      throw new Error("IMAP-сервер не подтвердил подключение.");
    }
    await this.command(
      `LOGIN ${quoteImap(this.config.user)} ${quoteImap(this.config.password)}`,
      "IMAP LOGIN",
    );
  }

  async findSentMailbox() {
    const response = await this.command('LIST "" "*"', "IMAP LIST");
    const sentLine = response.find((line) => /\\Sent\b/i.test(line));
    if (!sentLine) return "Sent";
    const quoted = sentLine.match(/"((?:[^"\\]|\\.)*)"\s*$/);
    if (quoted?.[1]) {
      return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return sentLine.trim().split(/\s+/).at(-1) || "Sent";
  }

  async findMessageUids(mailbox: string, messageId: string) {
    await this.command(`SELECT ${quoteImap(mailbox)}`, "IMAP SELECT Sent");
    const response = await this.command("UID SEARCH ALL", "IMAP SEARCH ALL");
    const searchLine = response.find((line) => /^\* SEARCH\b/i.test(line));
    const uids = (searchLine?.match(/\d+/g) ?? []).slice(-500);
    const matches: string[] = [];
    const expected = messageId.trim().toLowerCase();

    for (let index = 0; index < uids.length; index += 100) {
      const chunk = uids.slice(index, index + 100);
      const fetched = await this.command(
        `UID FETCH ${chunk.join(",")} (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])`,
        "IMAP FETCH Message-ID",
      );
      const blocks = fetched.join("\n").split(/\n(?=\* \d+ FETCH \()/i);
      for (const block of blocks) {
        const uid = block.match(/\bUID (\d+)\b/i)?.[1];
        const header = block
          .match(/^Message-ID:\s*(.+)$/im)?.[1]
          ?.trim()
          .toLowerCase();
        if (uid && header === expected) matches.push(uid);
      }
    }

    return matches;
  }

  async hasMessage(mailbox: string, messageId: string) {
    return (await this.findMessageUids(mailbox, messageId)).length > 0;
  }

  async removeDuplicateMessages(mailbox: string, messageIds: string[]) {
    const duplicateUids: string[] = [];
    for (const messageId of messageIds) {
      const matches = await this.findMessageUids(mailbox, messageId);
      duplicateUids.push(...matches.slice(1));
    }
    if (duplicateUids.length === 0) return 0;
    const uidSet = duplicateUids.join(",");
    await this.command(
      `UID STORE ${uidSet} +FLAGS.SILENT (\\Deleted)`,
      "IMAP mark duplicate deleted",
    );
    await this.command(`UID EXPUNGE ${uidSet}`, "IMAP expunge duplicate");
    return duplicateUids.length;
  }

  async append(mailbox: string, rawMessage: string, internalDate: Date) {
    const bytes = Buffer.from(rawMessage, "utf8");
    const tag = this.nextTag();
    const [dayOfWeek, day, month, year, time] = internalDate
      .toUTCString()
      .replace(",", "")
      .split(" ");
    void dayOfWeek;
    const date = `${day}-${month}-${year} ${time} +0000`;
    this.socket.write(
      `${tag} APPEND ${quoteImap(mailbox)} (\\Seen) ${quoteImap(date)} {${bytes.length}}\r\n`,
    );
    const continuation = await this.waitForLine();
    if (!continuation.startsWith("+")) {
      throw new Error("IMAP APPEND: сервер не разрешил передачу копии.");
    }
    this.socket.write(bytes);
    this.socket.write("\r\n");
    const response = await this.readTagged(tag);
    this.assertOk(tag, response, "IMAP APPEND");
  }

  async close() {
    try {
      await this.command("LOGOUT", "IMAP LOGOUT");
    } catch {
      // Ошибка LOGOUT не влияет на уже сохранённую копию.
    } finally {
      this.socket.destroy();
    }
  }
}

export async function appendToSentMailbox({
  rawMessage,
  messageId,
  sentAt,
}: {
  rawMessage: string;
  messageId: string;
  sentAt: Date;
}): Promise<ImapAppendResult> {
  const session = new ImapSession(getImapConfig());
  await session.connect();
  try {
    const mailbox = await session.findSentMailbox();
    const alreadyPresent = await session.hasMessage(mailbox, messageId);
    if (!alreadyPresent) {
      await session.append(mailbox, rawMessage, sentAt);
    }
    return { mailbox, already_present: alreadyPresent };
  } finally {
    await session.close();
  }
}

export async function removeDuplicateSentMailboxCopies(
  messageIds: string[],
): Promise<ImapDeduplicationResult> {
  const session = new ImapSession(getImapConfig());
  await session.connect();
  try {
    const mailbox = await session.findSentMailbox();
    const removed = await session.removeDuplicateMessages(mailbox, messageIds);
    return { mailbox, removed };
  } finally {
    await session.close();
  }
}

export async function auditSentMailboxCopies(
  messageIds: string[],
): Promise<ImapAuditResult> {
  const session = new ImapSession(getImapConfig());
  await session.connect();
  try {
    const mailbox = await session.findSentMailbox();
    const copies: number[] = [];
    for (const messageId of messageIds) {
      copies.push((await session.findMessageUids(mailbox, messageId)).length);
    }
    return { mailbox, copies };
  } finally {
    await session.close();
  }
}
