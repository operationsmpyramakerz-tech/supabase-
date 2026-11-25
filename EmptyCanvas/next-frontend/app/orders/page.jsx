// MY_ORDERS_THREE_WORKSPACES_V1
import CurrentOrdersPage from "../../components/orders/CurrentOrdersPage";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }) {
  return <CurrentOrdersPage searchParams={searchParams} />;
}
