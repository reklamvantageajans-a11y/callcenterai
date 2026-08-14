import { NextResponse } from "next/server";
import { callbacks } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = [...callbacks].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
  return NextResponse.json({ count: data.length, callbacks: data });
}
