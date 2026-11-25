import CurrentOrdersPage from "../../../components/orders/CurrentOrdersPage";
import { myOrderPageForType } from "../../../lib/my-order-pages.mjs";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }) {
  return <CurrentOrdersPage workspace={myOrderPageForType("withdraw-products")} searchParams={searchParams} />;
}
