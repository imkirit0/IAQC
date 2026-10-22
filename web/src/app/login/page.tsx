import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getMe, HOME } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { ThemeSwitch } from "@/components/ThemeSwitch";

export const metadata = { title: "Sign in" };

// Signed-in visitors are sent to their home page.
async function RedirectIfSignedIn(): Promise<null> {
  const me = await getMe();
  if (me) redirect(HOME[me.role]);
  return null;
}

export default function LoginPage() {
  return (
    <div className="login">
      <a className="skip" href="#signin">Skip to sign in</a>
      <Suspense><RedirectIfSignedIn /></Suspense>
      <section className="cover">
        <div className="cover-mast">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gtec-logo-cutout.png" alt="G-TEC Education" width={504} height={309} />
          
        </div>
        <div className="title">
          <h1 className="wordmark" aria-label="IAQC, Internal Audit and Quality Control">IAQC</h1>
          <div className="tri" aria-hidden="true"><i className="g" /><i className="y" /><i className="r" /></div>
        </div>
        <svg className="cover-arc" viewBox="0 0 600 600" aria-hidden="true">
          <circle className="ring" cx="300" cy="300" r="296" pathLength={100} />
          <circle className="ring b" cx="300" cy="300" r="262" pathLength={100} />
          <circle className="ink" cx="300" cy="300" r="279" pathLength={100} />
        </svg>
      </section>
      <section className="form" id="signin"><ThemeSwitch /><LoginForm /></section>
    </div>
  );
}
