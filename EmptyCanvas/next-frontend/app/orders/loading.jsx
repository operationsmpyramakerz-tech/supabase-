import ClassicOrdersLoading from "../../components/orders/ClassicOrdersLoading";

export default function CurrentOrdersLoading() {
  return <ClassicOrdersLoading title="Current Orders" bodyClass="current-orders-page" activeIndex={1} tabs={7} />;
}
