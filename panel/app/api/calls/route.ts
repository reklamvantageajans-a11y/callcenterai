import { NextResponse } from "next/server";
import { calls } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const outcome = searchParams.get("outcome") || "";

  let data = calls;
  if (q) {
    data = data.filter(
      (c) =>
        c.contactName.toLowerCase().includes(q) ||
        c.phoneNumber.toLowerCase().includes(q),
    );
  }
  if (outcome) data = data.filter((c) => c.outcome === outcome);

  return NextResponse.json({ count: data.length, calls: data });
}
