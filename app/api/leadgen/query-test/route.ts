import { NextResponse } from "next/server";
import { leadgenConfig } from "@/lib/leadgen/config";
import { buildSignalQueries } from "@/lib/leadgen/signals/query-builder";
import type { SignalType } from "@/lib/leadgen/types";

const signalTypes: SignalType[] = [
  "HIRING_SIGNAL",
  "GO_TO_MARKET_SIGNAL",
  "GROWTH_SIGNAL",
  "CONTENT_SIGNAL",
  "TRAFFIC_SIGNAL",
  "TECH_SIGNAL",
];

function isSignalType(value: string | null): value is SignalType {
  return signalTypes.includes(value as SignalType);
}

function readMaxQueries(value: string | null): number {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return 8;
  }

  return Math.min(parsedValue, 20);
}

export async function GET(request: Request) {
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

  const maxQueries = readMaxQueries(url.searchParams.get("maxQueries"));
  const queries = buildSignalQueries({
    icp: leadgenConfig.icp,
    signalType: signal,
    maxQueries,
  });

  return NextResponse.json({
    success: true,
    signal,
    max_queries: maxQueries,
    queries,
  });
}
