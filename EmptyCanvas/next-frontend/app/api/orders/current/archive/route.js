import { handleCurrentOrderAction } from "../../../../../lib/current-orders-actions-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  return handleCurrentOrderAction(request, "archive");
}
