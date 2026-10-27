import ShoppingCartPageServer from "../../../../components/orders/ShoppingCartPageServer";

export const dynamic = "force-dynamic";

export default async function ShoppingCartPage({ searchParams }) {
  return (
    <ShoppingCartPageServer
      searchParams={searchParams}
      flow="request-maintenance"
      initialType="Request Maintenance"
      title="Request Maintenance"
    />
  );
}
