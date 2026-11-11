import type { NextRequest } from "next/server";
import { audit, getMe } from "@/lib/auth";
import { allFeedback, feedbackVersions } from "@/lib/data";
import { exportGrid } from "@/lib/feedback";
import { fmtDT } from "@/lib/format";
import { gridFile } from "@/lib/sheet";

// ponytail: the file is built whole, so very large exports can pass the 4.5 MB hosting response limit; stream the CSV if that happens.
export async function GET(req: NextRequest) {
  const me = await getMe();
  if (me?.role !== "iaqc") {
    if (me) await audit(me, "ACCESS_DENIED", "feedback export");
    return new Response("Forbidden", { status: 403 });
  }
  const p = req.nextUrl.searchParams, csv = p.get("format") === "csv";
  const [rows, versions] = await Promise.all([allFeedback({ status: p.get("status") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, q: p.get("q") ?? undefined }), feedbackVersions()]);
  await audit(me, "FEEDBACK_EXPORTED", `${rows.length} responses as ${csv ? "CSV" : "Excel"}`);
  const body = gridFile(exportGrid(versions, rows, at => (at ? fmtDT(at) : "")), csv ? "csv" : "xlsx");
  return new Response(new Uint8Array(body), { headers: {
    "Content-Type": csv ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="student-feedback.${csv ? "csv" : "xlsx"}"`,
    "Cache-Control": "no-store",
  } });
}
