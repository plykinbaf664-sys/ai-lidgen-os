import { NextResponse } from "next/server";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";
import { runSignalPipelineTest } from "@/lib/leadgen/signals/signal-pipeline-test";
import type { SignalSearchMarket } from "@/lib/leadgen/signals/query-builder";
import type { SignalType } from "@/lib/leadgen/types";

const signalTypes: SignalType[] = [
  "HIRING_SIGNAL",
  "GO_TO_MARKET_SIGNAL",
  "GROWTH_SIGNAL",
  "CONTENT_SIGNAL",
  "TRAFFIC_SIGNAL",
  "TECH_SIGNAL",
];
const searchMarkets: SignalSearchMarket[] = ["global", "ru", "mixed"];

function isSignalType(value: string | null): value is SignalType {
  return signalTypes.includes(value as SignalType);
}

function readNumberParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue)) {
    return undefined;
  }

  return parsedValue;
}

function readMarketParam(value: string | null): SignalSearchMarket | undefined {
  if (!value) {
    return undefined;
  }

  return searchMarkets.includes(value as SignalSearchMarket)
    ? (value as SignalSearchMarket)
    : undefined;
}

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const signal = url.searchParams.get("signal");

    if (!isSignalType(signal)) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid signal query parameter is required",
          allowed_signals: signalTypes,
        },
        { status: 400 },
      );
    }

    const providerParam = url.searchParams.get("provider");
    const searchProvider = createLeadgenSearchProvider({
      mode: isLeadgenSearchProviderMode(providerParam) ? providerParam : undefined,
    });
    const result = await runSignalPipelineTest({
      signalType: signal,
      searchProvider,
      targetCandidates: readNumberParam(
        url.searchParams.get("targetCandidates"),
      ),
      maxQueries: readNumberParam(url.searchParams.get("maxQueries")),
      maxResultsPerQuery: readNumberParam(
        url.searchParams.get("maxResultsPerQuery"),
      ),
      market: readMarketParam(url.searchParams.get("market")),
    });

    return NextResponse.json({
      success: true,
      ...result,
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
