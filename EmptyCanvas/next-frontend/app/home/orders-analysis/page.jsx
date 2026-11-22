// ERP_HOME_ORDERS_ANALYSIS_NAV_V1
// Uses the same signed-in Home data loader, role grants, user/data scope and
// analytics filters as /home. There is no parallel unprotected data endpoint.
import HomePage from "../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OrdersAnalysisPage({ searchParams }) {
  return <HomePage searchParams={searchParams} analysisView="orders" />;
}
