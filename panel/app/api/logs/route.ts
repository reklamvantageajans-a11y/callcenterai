import { NextResponse } from "next/server";
import { logs } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level") || "";
  let data = logs;
  if (level) data = data.filter((l) => l.level === level);
  return NextResponse.json({ count: data.length, logs: data });
}
