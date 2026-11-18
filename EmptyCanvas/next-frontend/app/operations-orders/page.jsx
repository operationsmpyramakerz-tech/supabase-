import { redirect } from "next/navigation";
import { operationsLegacyDestination } from "../../lib/operations-order-pages.mjs";

export const dynamic = "force-dynamic";

export default async function OperationsOrdersIndex({ searchParams }) {
  redirect(operationsLegacyDestination(await searchParams));
}
