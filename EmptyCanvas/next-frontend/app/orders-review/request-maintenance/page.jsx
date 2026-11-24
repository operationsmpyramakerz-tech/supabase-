import OrdersReviewPage from "../../../components/orders/OrdersReviewPage";
import { reviewPageForType } from "../../../lib/review-order-pages.mjs";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }) {
  return <OrdersReviewPage workspace={reviewPageForType("requestmaintenance")} searchParams={searchParams} />;
}
