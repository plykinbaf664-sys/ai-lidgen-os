import { NextResponse } from "next/server";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim();

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "query parameter is required",
        },
        { status: 400 },
      );
    }

    const providerParam = url.searchParams.get("provider");
    const marketParam = url.searchParams.get("market");
    const languageParam = url.searchParams.get("language");
    const provider = createLeadgenSearchProvider({
      mode: isLeadgenSearchProviderMode(providerParam) ? providerParam : undefined,
    });
    const results = await provider.search({
      query,
      maxResults: 5,
      market: marketParam === "ru" ? "ru" : "global",
      queryLanguage: languageParam === "ru" ? "ru" : "en",
    });

    return NextResponse.json({
      success: true,
      query,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatRouteError(error),
      },
      { status: 500 },
    );
  }
}
