import { Suspense } from "react";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { getCentres, getUsers } from "@/lib/data";
import { CentresManager } from "./CentresManager";

export const metadata = { title: "Centres" };

async function CentresPage() {
  await requireRole("iaqc");
  const [centres, users] = await Promise.all([getCentres(), getUsers()]);
  return <CentresManager centres={centres} acs={users.filter(u => u.role === "ac").map(u => ({ id: u.id, name: u.name, username: u.username, active: u.active }))} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><CentresPage /></Suspense>;
}
