import "server-only";

import { randomUUID } from "node:crypto";
import { mutateLocalTable, readLocalTable } from "@/lib/leadgen/local-database";
import type { ContactImportPreview, ImportedContactRow } from "@/lib/leadgen/contact-import";
import { importedRowToUnifiedCandidate } from "@/lib/leadgen/source-candidate-adapters";

const PREVIEW_TTL_MS = 24 * 60 * 60 * 1_000;
const PREVIEW_TABLE = "leadgen_import_previews";
const BATCH_TABLE = "leadgen_import_batches";
const ROW_TABLE = "leadgen_import_rows";

type StoredPreview = {
  id: string;
  file_hash: string;
  filename: string;
  summary: ContactImportPreview["summary"];
  rows: ImportedContactRow[];
  created_at: string;
  expires_at: string;
};

export async function cleanupExpiredImportPreviews(now = new Date()) {
  return mutateLocalTable(PREVIEW_TABLE, (rows) => {
    const active = rows.filter(
      (row) => Date.parse(String(row.expires_at ?? "")) > now.getTime(),
    );
    const removed = rows.length - active.length;
    rows.splice(0, rows.length, ...active);
    return removed;
  });
}

export async function saveImportPreview(preview: ContactImportPreview) {
  await cleanupExpiredImportPreviews();
  const existingBatches = await readLocalTable(BATCH_TABLE);
  const alreadyImported = existingBatches.some(
    (row) => row.file_hash === preview.fileHash,
  );
  const id = `import-preview-${randomUUID()}`;
  const createdAt = new Date();
  const stored: StoredPreview = {
    id,
    file_hash: preview.fileHash,
    filename: preview.filename,
    summary: preview.summary,
    rows: alreadyImported ? [] : preview.rows,
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + PREVIEW_TTL_MS).toISOString(),
  };
  await mutateLocalTable(PREVIEW_TABLE, (rows) => {
    rows.push(stored);
  });
  return { previewId: id, expiresAt: stored.expires_at, alreadyImported };
}

export async function confirmImportPreview(previewId: string) {
  await cleanupExpiredImportPreviews();
  const previews = await readLocalTable<StoredPreview>(PREVIEW_TABLE);
  const preview = previews.find((item) => item.id === previewId);
  if (!preview) throw new Error("Предпросмотр импорта не найден или истёк.");
  const batches = await readLocalTable(BATCH_TABLE);
  const duplicate = batches.find((row) => row.file_hash === preview.file_hash);
  if (duplicate) {
    await mutateLocalTable(PREVIEW_TABLE, (rows) => {
      const index = rows.findIndex((row) => row.id === previewId);
      if (index >= 0) rows.splice(index, 1);
    });
    return {
      status: "DUPLICATE" as const,
      batchId: String(duplicate.id),
      campaignId:
        typeof duplicate.campaign_id === "string" ? duplicate.campaign_id : null,
      imported: 0,
    };
  }
  const batchId = `import-${preview.file_hash.slice(0, 24)}`;
  const accepted = preview.rows.filter((row) => row.status === "SUCCESS");
  const now = new Date().toISOString();
  await mutateLocalTable(BATCH_TABLE, (rows) => {
    rows.push({
      id: batchId,
      file_hash: preview.file_hash,
      filename: preview.filename,
      summary: preview.summary,
      status: "READY_FOR_ENRICHMENT",
      created_at: now,
    });
  });
  await mutateLocalTable(ROW_TABLE, (rows) => {
    rows.push(
      ...accepted.map((row) => ({
        ...row,
        import_batch_id: batchId,
        origin_context: {
          ...row.originContext,
          import_batch_id: batchId,
        },
        pipeline_status: "READY_FOR_ENRICHMENT",
        normalized_candidate: importedRowToUnifiedCandidate(row),
        created_at: now,
      })),
    );
  });
  await mutateLocalTable(PREVIEW_TABLE, (rows) => {
    const index = rows.findIndex((row) => row.id === previewId);
    if (index >= 0) rows.splice(index, 1);
  });
  return { status: "SUCCESS" as const, batchId, campaignId: null, imported: accepted.length };
}

export async function getImportMetrics() {
  const [batches, rows] = await Promise.all([
    readLocalTable(BATCH_TABLE),
    readLocalTable(ROW_TABLE),
  ]);
  return {
    batches: batches.length,
    rows: rows.length,
    readyForEnrichment: rows.filter(
      (row) => row.pipeline_status === "READY_FOR_ENRICHMENT",
    ).length,
  };
}

export async function getImportBatchRows(batchId: string) {
  const rows = await readLocalTable(ROW_TABLE);
  return rows.filter((row) => row.import_batch_id === batchId);
}

export async function getImportBatch(batchId: string) {
  const batches = await readLocalTable(BATCH_TABLE);
  return batches.find((row) => row.id === batchId) ?? null;
}

export async function completeImportBatch({
  batchId,
  campaignId,
  resultSummary,
}: {
  batchId: string;
  campaignId: string;
  resultSummary: Record<string, number>;
}) {
  const completedAt = new Date().toISOString();
  await mutateLocalTable(BATCH_TABLE, (rows) => {
    const batch = rows.find((row) => row.id === batchId);
    if (!batch) throw new Error("Пакет импорта не найден.");
    batch.status = "COMPLETED";
    batch.campaign_id = campaignId;
    batch.result_summary = resultSummary;
    batch.completed_at = completedAt;
  });

  // Parsed rows are transient PII. The permanent audit record is the file
  // hash, sanitized filename and aggregate result stored on the batch.
  await mutateLocalTable(ROW_TABLE, (rows) => {
    const retained = rows.filter((row) => row.import_batch_id !== batchId);
    rows.splice(0, rows.length, ...retained);
  });
}
