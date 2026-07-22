import { NextResponse } from "next/server";
import { updateFollowup } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const patch = (await request.json()) as { subject?: string; body?: string; email?: string };
    return NextResponse.json({ success: true, entry: await updateFollowup(id, patch) });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
