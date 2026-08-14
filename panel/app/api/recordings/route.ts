import { NextResponse } from "next/server";
import { recordings } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ count: recordings.length, recordings });
}
