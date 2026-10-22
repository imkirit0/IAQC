import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getMe, HOME } from "@/lib/auth";

export default function Home() {
  return <Suspense><Go /></Suspense>;
}

async function Go(): Promise<null> {
  const me = await getMe();
  redirect(me ? HOME[me.role] : "/login");
}
