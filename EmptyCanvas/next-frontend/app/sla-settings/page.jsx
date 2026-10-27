import { redirect } from 'next/navigation';
import AppShell from '../../components/AppShell';
import SlaSettingsClient from '../../components/home/SlaSettingsClient';
import { getDirectAccountGate } from '../../lib/products-auth';
import { canViewSla, canManageSla } from '../../lib/home-sla-settings';

export const dynamic = 'force-dynamic';

export default async function SlaSettingsPage() {
  const gate = await getDirectAccountGate([]);
  if (gate.status === 401) redirect('/login?next=/next/sla-settings');
  if (!gate.ok || !canViewSla(gate.account)) {
    return <main className="standalone-state"><section className="state-card"><h1>SLA settings are restricted</h1><p>Your account does not have access to SLA settings. Contact an administrator to review your permissions.</p><a href="/next/home">Back to Home</a></section></main>;
  }
  return <AppShell account={gate.account} title="SLA Settings" activePath="/next/home"
    bodyClass="page-home page-sla-settings" pageStyles={["/next/css/sla-settings.css?v=phase8-1"]}>
    <SlaSettingsClient canEdit={canManageSla(gate.account)} />
  </AppShell>;
}
