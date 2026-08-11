const LEGACY_PREVIEW_LENGTH = 240;

export function isLegacyTruncatedOutreachBody(body: string | null | undefined) {
  if (!body) return false;
  return body.length === LEGACY_PREVIEW_LENGTH + 1 && body.endsWith("…");
}

export function assertCompleteOutreachBody(body: string | null | undefined) {
  if (!body?.trim()) {
    throw new Error("Текст письма пуст.");
  }
  if (isLegacyTruncatedOutreachBody(body)) {
    throw new Error(
      "Текст письма обрезан старым preview. Отправка заблокирована до повторной проверки.",
    );
  }
}
