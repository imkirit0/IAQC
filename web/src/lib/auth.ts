import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { authClient, db } from "./supabase";

export type Role = "ac" | "iaqc" | "cmd" | "dept";
export type Me = { id: string; username: string; name: string; role: Role; district: string | null; department: string | null };

export const HOME: Record<Role, string> = { iaqc: "/ranking", cmd: "/overview", ac: "/visits", dept: "/support" };
export const ROLE_LABEL: Record<Role, string> = { ac: "Area Coordinator", iaqc: "IAQA Coordinator", cmd: "CMD, Super Admin", dept: "Department In-Charge" };

/** Current user with a live profile check (deactivated accounts lose access immediately). Cached per request. */
export const getMe = cache(async (): Promise<Me | null> => {
  const { data } = await (await authClient()).auth.getUser();
  if (!data.user) return null;
  const { data: p } = await db().from("profiles").select("id, username, name, role, active, department").eq("id", data.user.id).maybeSingle();
  if (!p || !p.active) return null;
  return { id: p.id, username: p.username, name: p.name, role: p.role, district: data.user.app_metadata?.district || null, department: p.department ?? null }; // set via the service key only
});

/** Pages: redirect away when not signed in or not permitted. */
export async function requireRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!roles.includes(me.role)) redirect(HOME[me.role]);
  return me;
}

/** District-scoped accounts may only see centres in their district. */
export const inScope = (me: Me, district: string) => !me.district || me.district.toLowerCase() === district.toLowerCase();

/** Area Coordinators and ASO Directors raise support requests; CMD itself only monitors. */
export const canRequest = (me: Me) => me.role === "ac" || (me.role === "cmd" && !!me.district);

export class Forbidden extends Error {}

/** Server actions: throw instead of redirect, and record the attempt. */
export async function guard(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me) throw new Forbidden("Your session has ended. Please sign in again.");
  if (!roles.includes(me.role)) {
    await audit(me, "ACCESS_DENIED", `action requires ${roles.join("/")}`);
    throw new Forbidden("You do not have permission for this action.");
  }
  return me;
}

export async function audit(me: Pick<Me, "id" | "username"> | null, action: string, detail = "") {
  await db().from("audit_log").insert({ user_id: me?.id ?? null, username: me?.username ?? null, action, detail });
}

export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@rds.local`;
