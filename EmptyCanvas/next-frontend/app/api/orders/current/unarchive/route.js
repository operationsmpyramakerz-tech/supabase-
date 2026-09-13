import { handleCurrentOrdersAction } from "../../../../../lib/orders-action-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  return handleCurrentOrdersAction(request, "unarchive");
}
