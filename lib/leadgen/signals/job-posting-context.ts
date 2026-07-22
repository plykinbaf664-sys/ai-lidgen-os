import type { SearchResult } from "@/lib/leadgen/search/search-provider";

type JobPostingJsonLd = {
  "@type"?: unknown;
  title?: unknown;
  description?: unknown;
  datePosted?: unknown;
  hiringOrganization?: {
    name?: unknown;
  };
};

const HH_VACANCY_HOST_PATTERN = /(^|\.)hh\.ru$/i;
const JSON_LD_SCRIPT_PATTERN =
  /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;

function isHhVacancy(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      HH_VACANCY_HOST_PATTERN.test(parsed.hostname) &&
      /^\/vacancy\/\d+/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function findJobPosting(value: unknown): JobPostingJsonLd | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const posting = findJobPosting(item);
      if (posting) return posting;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record["@type"] === "JobPosting") {
    return record as JobPostingJsonLd;
  }

  for (const child of Object.values(record)) {
    const posting = findJobPosting(child);
    if (posting) return posting;
  }

  return null;
}

export function parseJobPostingContext(html: string): {
  companyName: string;
  jobTitle: string;
  datePosted: string | null;
  description: string | null;
} | null {
  for (const match of html.matchAll(JSON_LD_SCRIPT_PATTERN)) {
    try {
      const posting = findJobPosting(JSON.parse(match[1] ?? ""));
      const companyName = asText(posting?.hiringOrganization?.name);
      const jobTitle = asText(posting?.title);

      if (!posting || !companyName || !jobTitle) {
        continue;
      }

      const rawDescription = asText(posting.description);
      return {
        companyName,
        jobTitle,
        datePosted: asText(posting.datePosted),
        description: rawDescription
          ? stripHtml(rawDescription).slice(0, 1_200)
          : null,
      };
    } catch {
      // Ignore malformed JSON-LD and continue to the next structured block.
    }
  }

  return null;
}

export async function enrichJobPostingSearchResult(
  result: SearchResult,
): Promise<SearchResult> {
  if (!isHhVacancy(result.url)) {
    return result;
  }

  try {
    const response = await fetch(result.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadgenOS/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return result;
    }

    const context = parseJobPostingContext(await response.text());
    if (!context) {
      return result;
    }

    const evidence = [
      `Работодатель: ${context.companyName}; открыта вакансия: ${context.jobTitle}.`,
      context.datePosted ? `Дата публикации: ${context.datePosted}.` : "",
      context.description ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      ...result,
      title: `Вакансия ${context.jobTitle} — ${context.companyName}`,
      snippet: evidence,
      raw_content: evidence,
      published_at: context.datePosted ?? result.published_at,
    };
  } catch {
    return result;
  }
}
