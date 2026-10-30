import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import PurchaseRequisitionClient from "../../../components/orders/PurchaseRequisitionClient";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { featureGate } from "../../../lib/feature-permissions-server";
import { assertOrderIdsInScope } from "../../../lib/order-data-scope";
import { loadOperationsOrderDetails } from "../../../lib/operations-orders-data";
import { prInitialForm } from "../../../lib/purchase-requisition-data.mjs";

export const dynamic = "force-dynamic";
function ErrorState({message}){return <section className="pr-error-page" role="alert"><h2>Purchase Requisition</h2><p>{message}</p><a href="/next/operations-orders">Back to Operations Orders</a></section>;}
export default async function PurchaseRequisitionPage({searchParams}){
  const gate=featureGate(await getLegacyAccountGate(["Requested Orders","Operations Orders"]),"orders.operations.export");
  if(gate.status===401)redirect("/login?next=/next/operations-orders");
  if(!gate.ok)return <ErrorState message={gate.error||"Access denied"}/>;
  const params=await searchParams;
  const ids=[...new Set(String(params?.ids||"").split(",").map(s=>s.trim()).filter(s=>/^\d+$/.test(s)))];
  if(!ids.length||ids.length>1000)return <ErrorState message="Select one order from Operations Orders to prepare a purchase requisition."/>;
  let form;
  try{
    await assertOrderIdsInScope(gate.account,"orders.operations.export",ids);
    const items=await loadOperationsOrderDetails(ids);
    if(!items?.length)throw new Error("Order components are not available.");
    form=prInitialForm(items,gate.account);
  }catch(error){return <ErrorState message={error?.message||"Could not read this order"}/>;}
  return <AppShell account={gate.account} title="Purchase Requisition" eyebrow="Operations Orders" activePath="/next/operations-orders" bodyClass="operations-orders-page purchase-requisition-page">
    <PurchaseRequisitionClient initialForm={form} orderIds={ids}/>
  </AppShell>;
}
