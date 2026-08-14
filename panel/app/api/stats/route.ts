import { NextResponse } from "next/server";
import { computeStats } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = computeStats();
  // Simulate a live feed: active calls jitter a little each poll.
  const activeNow = Math.max(0, base.activeNow + (Math.floor(Math.random() * 3) - 1));
  return NextResponse.json({ ...base, activeNow, ts: new Date().toISOString() });
}
