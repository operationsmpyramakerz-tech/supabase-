import { redirect } from "next/navigation";

export default function LmsRemovedFromNextLayout() {
  redirect("/lms?classic=1");
}
