import { NextResponse } from "next/server";
import { expenseScreenshotForId } from "../../../../lib/expenses-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const url = new URL(request.url);
  const expenseId = String(url.searchParams.get("expenseId") || "").trim();
  const index = url.searchParams.get("index") || "0";

  try {
    const screenshot = await expenseScreenshotForId(expenseId, index);
    const response = NextResponse.redirect(screenshot.url, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return new Response(error?.message || "Failed to open screenshot.", {
      status: Number(error?.status) || 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
