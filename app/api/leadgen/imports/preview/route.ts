import { NextResponse } from "next/server";
import { parseContactImport } from "@/lib/leadgen/contact-import";
import { saveImportPreview } from "@/lib/leadgen/contact-import-store";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  isAuthorizedLeadSourceRequest,
  leadSourceOriginEnabled,
} from "@/lib/leadgen/lead-source-security";
import { getKnownRecipientEmails } from "@/lib/leadgen/outreach-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 5.5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Файл превышает лимит 5 МБ." }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "Файл обязателен." }, { status: 400 });
    }
    const existingEmails = await getKnownRecipientEmails().catch(() => new Set<string>());
    const preview = parseContactImport({
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type,
      existingEmails,
    });
    const stored = await saveImportPreview(preview);
    return NextResponse.json({
      success: true,
      previewId: stored.previewId,
      expiresAt: stored.expiresAt,
      alreadyImported: stored.alreadyImported,
      productionEnabled: leadSourceOriginEnabled("IMPORTED"),
      summary: preview.summary,
      rows: preview.rows.slice(0, 50).map((row) => ({
        rowNumber: row.rowNumber,
        company: row.company,
        fullName: row.full_name,
        role: row.role,
        email: row.email,
        status: row.status,
        reasons: row.reasons,
        requiresEnrichment: row.requiresEnrichment,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 400 },
    );
  }
}
