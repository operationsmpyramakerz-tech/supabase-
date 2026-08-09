import PwaStartClient from "../../components/pwa/PwaStartClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Opening Operations Hub",
  description: "Launch the installed Operations Hub application.",
};

export default function PwaStartPage() {
  return <PwaStartClient />;
}
