import ClassicOrdersLoading from "../../components/orders/ClassicOrdersLoading";

export default function CurrentOrdersLoading() {
  return <ClassicOrdersLoading title="Current Orders" bodyClass="current-orders-page" activeIndex={2} tabs={7} />;
}
