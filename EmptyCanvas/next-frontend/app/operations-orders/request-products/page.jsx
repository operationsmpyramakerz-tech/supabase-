import OperationsOrdersPage from "../../../components/orders/OperationsOrdersPage";
import { operationsPageForType } from "../../../lib/operations-order-pages.mjs";

export const dynamic = "force-dynamic";

export default function Page() {
  return <OperationsOrdersPage workspace={operationsPageForType("requestproducts")} />;
}
