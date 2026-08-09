import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runSupabaseBackupSync } from "@/lib/leadgen/supabase-backup-sync";

function authorized(request: NextRequest) {
  const expected = process.env.LEADGEN_SYNC_TOKEN;
  const supplied = request.headers.get("x-leadgen-sync-token");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const result = await runSupabaseBackupSync();
  return NextResponse.json(result, { status: result.success ? 200 : 503 });
}
