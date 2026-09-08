import "server-only";

import { normalizeDomain } from "@/lib/leadgen/company-identity";
import { classifyEvidenceBackedEmail, getContactLevel } from "@/lib/leadgen/contact-quality";
import { getImportBatch, getImportBatchRows } from "@/lib/leadgen/contact-import-store";
import { buildEmailOutreach } from "@/lib/leadgen/email-outreach-builder";
import { validateFirstEmailV3 } from "@/lib/leadgen/first-email-generator";
import { listLocalOutreachEntries } from "@/lib/leadgen/local-outreach-store";
import { verifyCompanySegment, type SegmentMatch } from "@/lib/leadgen/segment-guard";
import type { LeadgenContact } from "@/lib/leadgen/types";
import type { LeadgenVerticalId } from "@/lib/leadgen/verticals";

const FREE_MAILBOXES = new Set([
  "gmail.com", "googlemail.com", "mail.ru", "bk.ru", "inbox.ru", "list.ru",
  "yandex.ru", "ya.ru", "outlook.com", "hotmail.com", "icloud.com",
]);

export type ImportCanaryItem = {
  rowNumber: number;
  status: "READY" | "REJECTED" | "EXISTING";
  reason: string;
  companyResolved: boolean;
  domainConfirmed: boolean;
  icpResult: SegmentMatch | "NOT_CHECKED";
  contactUsable: boolean;
  contactLevel: string | null;
  outreachGenerated: boolean;
  historicalSentProtected: boolean;
  details?: string[];
};

export type ImportEnrichmentCanaryResult = {
  mode: "READ_ONLY_AFTER_CONFIRM";
  batchId: string;
  metrics: {
    rows: number;
    valid: number;
    invalid: number;
    duplicates: number;
    existingContacts: number;
    newCandidates: number;
    companyResolved: number;
    domainConfirmed: number;
    icpMatch: number;
    contactsUsable: number;
    outreachGenerated: number;
    ready: number;
    rejected: number;
  };
  items: ImportCanaryItem[];
  mutatedOutreach: false;
  autoSend: false;
  smtpCalls: 0;
};

function text(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? String(row[key]).trim() : "";
}

function emailDomain(email: string) {
  return email.toLowerCase().split("@")[1] ?? "";
}

function makeContact(input: {
  rowNumber: number;
  company: string;
  email: string;
  fullName: string;
  role: string;
  classification: string;
}): LeadgenContact {
  const createdAt = new Date().toISOString();
  return {
    id: `import-canary-contact-${input.rowNumber}`,
    pipeline_run_id: "import-canary",
    campaign_id: "import-canary",
    company_id: `import-canary-company-${input.rowNumber}`,
    lead_id: `import-canary-lead-${input.rowNumber}`,
    contact_type: "generic_email",
    full_name: input.fullName || null,
    role_title: input.role || null,
    department: input.classification === "DEPARTMENT" ? input.role || null : null,
    email: input.email,
    linkedin_url: null,
    telegram_url: null,
    contact_url: null,
    source_url: null,
    source_label: "Imported contact canary",
    confidence_score: 65,
    is_primary: true,
    metadata: {
      email_classification: input.classification === "DEPARTMENT"
        ? "department_verified"
        : "general_verified",
      imported_identity_unverified: true,
      company_name: input.company,
    },
    created_at: createdAt,
  };
}

export async function runImportEnrichmentCanary({
  batchId,
  verticalId,
}: {
  batchId: string;
  verticalId: LeadgenVerticalId;
}): Promise<ImportEnrichmentCanaryResult> {
  const [batch, rows, outreach] = await Promise.all([
    getImportBatch(batchId),
    getImportBatchRows(batchId),
    listLocalOutreachEntries().catch(() => []),
  ]);
  if (!batch) throw new Error("Import batch не найден.");
  const existingByEmail = new Map(
    outreach.map((entry) => [entry.email.trim().toLowerCase(), entry]),
  );
  const items: ImportCanaryItem[] = [];
  for (const rawRow of rows.slice(0, 50)) {
    const row = rawRow as Record<string, unknown>;
    const rowNumber = Number(row.rowNumber ?? 0);
    const email = text(row, "email").toLowerCase();
    const company = text(row, "company");
    const fullName = text(row, "full_name");
    const role = text(row, "role");
    const notes = text(row, "notes");
    const explicitDomain = normalizeDomain(text(row, "domain") || text(row, "website"));
    const mailDomain = emailDomain(email);
    const existing = existingByEmail.get(email);
    if (existing) {
      items.push({
        rowNumber,
        status: "EXISTING",
        reason: existing.status === "sent" || Boolean(existing.sent_at)
          ? "historical_sent_contact_protected"
          : "existing_contact",
        companyResolved: Boolean(company),
        domainConfirmed: Boolean(explicitDomain && explicitDomain === mailDomain),
        icpResult: "NOT_CHECKED",
        contactUsable: true,
        contactLevel: null,
        outreachGenerated: false,
        historicalSentProtected: existing.status === "sent" || Boolean(existing.sent_at),
      });
      continue;
    }
    const companyResolved = Boolean(company && (explicitDomain || mailDomain));
    const freeMailbox = FREE_MAILBOXES.has(mailDomain);
    const domainConfirmed = Boolean(
      explicitDomain &&
      !freeMailbox &&
      (mailDomain === explicitDomain || mailDomain.endsWith(`.${explicitDomain}`)),
    );
    if (!companyResolved) {
      items.push({
        rowNumber,
        status: "REJECTED",
        reason: freeMailbox ? "free_mailbox_requires_enrichment" : "company_identity_not_resolved",
        companyResolved: false,
        domainConfirmed: false,
        icpResult: "NOT_CHECKED",
        contactUsable: false,
        contactLevel: null,
        outreachGenerated: false,
        historicalSentProtected: false,
      });
      continue;
    }
    if (!domainConfirmed) {
      items.push({
        rowNumber,
        status: "REJECTED",
        reason: freeMailbox ? "free_mailbox_requires_enrichment" : "company_email_domain_relation_not_confirmed",
        companyResolved: true,
        domainConfirmed: false,
        icpResult: "NOT_CHECKED",
        contactUsable: false,
        contactLevel: null,
        outreachGenerated: false,
        historicalSentProtected: false,
      });
      continue;
    }
    const segment = verifyCompanySegment({
      selectedSegment: verticalId,
      companyName: company,
      companySegment: null,
      industry: null,
      officialWebsite: `https://${explicitDomain}`,
      signalTitle: null,
      signalSummary: notes || null,
      signalEvidence: notes || null,
      discoveryQuery: "import canary",
    });
    const classification = classifyEvidenceBackedEmail({
      email,
      officialDomain: explicitDomain!,
      confirmedPerson: false,
    });
    const level = getContactLevel({ confirmedPerson: false, classification });
    const contactUsable = level.ready;
    let outreachGenerated = false;
    let ready = false;
    let reason = segment.match === "MATCH" ? "ready_for_outreach_review" : `icp_${segment.match.toLowerCase()}`;
    if (segment.match === "MATCH" && contactUsable && notes) {
      const contact = makeContact({ rowNumber, company, email, fullName, role, classification });
      const outreachResult = buildEmailOutreach({
        companyName: company,
        companyWebsite: `https://${explicitDomain}`,
        personName: null,
        personRole: null,
        contact,
        readiness: "fallback_ready",
        whyNow: notes,
        selectionReason: "Контекст предоставлен в импортированной базе; личность получателя не подтверждена.",
        signalType: "IMPORTED_CONTEXT",
        signalTitle: "Контекст импортированной базы",
        signalDetail: notes,
        signalSourceUrl: null,
        verticalId,
      });
      outreachGenerated = Boolean(outreachResult.subject && outreachResult.body);
      ready = outreachGenerated && outreachResult.qualityGatePassed;
      if (!ready) {
        reason = "outreach_quality_gate_failed";
        const validation = outreachResult.subject
          ? validateFirstEmailV3(
              { subject: outreachResult.subject, body: outreachResult.body },
              {
                companyName: company,
                website: `https://${explicitDomain}`,
                contactEmail: email,
                messageMode: "generic_routing",
                growthSignal: `IMPORTED_CONTEXT Контекст импортированной базы ${notes}`,
                signalType: "IMPORTED_CONTEXT",
                signalEvidence: notes,
                verticalId,
              },
            )
          : { valid: false, errors: ["subject_missing"] };
        if (!validation.valid) {
          items.push({
            rowNumber,
            status: "REJECTED",
            reason,
            details: validation.errors,
            companyResolved,
            domainConfirmed,
            icpResult: segment.match,
            contactUsable,
            contactLevel: level.level,
            outreachGenerated,
            historicalSentProtected: false,
          });
          continue;
        }
      }
    } else if (!notes && segment.match === "MATCH" && contactUsable) {
      reason = "insufficient_context_for_truthful_outreach";
    }
    items.push({
      rowNumber,
      status: ready ? "READY" : "REJECTED",
      reason,
      companyResolved,
      domainConfirmed,
      icpResult: segment.match,
      contactUsable,
      contactLevel: level.level,
      outreachGenerated,
      historicalSentProtected: false,
      details: !ready && outreachGenerated ? ["quality_score_threshold_failed"] : undefined,
    });
  }
  const summary = batch.summary && typeof batch.summary === "object"
    ? batch.summary as Record<string, unknown>
    : {};
  const metrics = {
    rows: Number(summary.rowsTotal ?? rows.length),
    valid: Number(summary.valid ?? rows.length),
    invalid: Number(summary.invalid ?? 0),
    duplicates: Number(summary.duplicates ?? 0),
    existingContacts: items.filter((item) => item.status === "EXISTING").length,
    newCandidates: items.filter((item) => item.status !== "EXISTING").length,
    companyResolved: items.filter((item) => item.companyResolved).length,
    domainConfirmed: items.filter((item) => item.domainConfirmed).length,
    icpMatch: items.filter((item) => item.icpResult === "MATCH").length,
    contactsUsable: items.filter((item) => item.contactUsable).length,
    outreachGenerated: items.filter((item) => item.outreachGenerated).length,
    ready: items.filter((item) => item.status === "READY").length,
    rejected: items.filter((item) => item.status === "REJECTED").length,
  };
  return {
    mode: "READ_ONLY_AFTER_CONFIRM",
    batchId,
    metrics,
    items,
    mutatedOutreach: false,
    autoSend: false,
    smtpCalls: 0,
  };
}
