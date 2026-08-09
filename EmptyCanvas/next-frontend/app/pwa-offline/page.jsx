import PwaOfflineClient from "../../components/pwa/PwaOfflineClient";

export const metadata = {
  title: "Operations Hub Offline",
  description: "Offline fallback for the Operations Hub installed application.",
};

export default function PwaOfflinePage() {
  return <PwaOfflineClient />;
}
