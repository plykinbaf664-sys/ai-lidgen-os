import { NextResponse } from "next/server";
import { TavilySearchProvider } from "@/lib/leadgen/search/tavily-provider";

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

    const provider = new TavilySearchProvider();
    const results = await provider.search({
      query,
      maxResults: 5,
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
