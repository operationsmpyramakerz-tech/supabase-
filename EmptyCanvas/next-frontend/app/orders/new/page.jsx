import { redirect } from "next/navigation";

const TYPE_TO_FLOW = Object.freeze({
  "request products": "request-products",
  "withdraw products": "withdraw-products",
  "request maintenance": "request-maintenance",
});

function flowForType(value) {
  return TYPE_TO_FLOW[String(value || "").trim().toLowerCase()] || "request-products";
}

export default async function ShoppingCartIndexPage({ searchParams }) {
  const query = await Promise.resolve(searchParams);
  const flow = flowForType(query?.type);
  const params = new URLSearchParams();

  if (String(query?.edit || "") === "1") params.set("edit", "1");
  if (String(query?.editKey || "").trim()) params.set("editKey", String(query.editKey).trim());

  const suffix = params.toString() ? `?${params.toString()}` : "";
  redirect(`/next/orders/new/${flow}${suffix}`);
}
