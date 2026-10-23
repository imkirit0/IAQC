import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { Masthead } from "@/components/Masthead";
import Loading from "./loading";

// Everything below depends on the signed-in user, so it streams in behind a skeleton.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="app"><header className="mast"><div className="mast-in"><span className="brand">{ }<img src="/brand/gtec-logo.png" alt="G-TEC Education" width={50} height={34} /><b>IAQA</b></span></div></header><main className="main"><div className="content"><Loading /></div></main></div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <Masthead me={me} />
      <main className="main" id="main" tabIndex={-1}><div className="content"><Suspense fallback={<Loading />}>{children}</Suspense></div></main>
    </div>
  );
}
