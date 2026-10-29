import { Suspense } from "react";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { getAsos, getCentres, getSettings, getUsers } from "@/lib/data";
import { UsersManager } from "./UsersManager";

export const metadata = { title: "Users" };

async function UsersPage() {
  await requireRole("iaqc");
  const [users, centres, st, asos] = await Promise.all([getUsers(), getCentres(), getSettings(), getAsos()]);
  return <UsersManager users={users} centres={centres.filter(c => c.active).map(c => ({ id: c.id, code: c.code, name: c.name, district: c.district, ac_id: c.ac_id, ac_name: c.ac_name ?? null }))} departments={st.departments} asos={asos} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><UsersPage /></Suspense>;
}
