"""End-to-end check of the acceptance workflow + scoring safeguards. Run: python test_rds.py"""
import os, tempfile, datetime as dt
import app as rds
import seed

rds.DB = os.path.join(tempfile.mkdtemp(), "test.db")
seed.init_db(reset=True)
rds.app.testing = True


def client(user, pw):
    c = rds.app.test_client()
    r = c.post("/api/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.json
    return c


# --- scoring engine safeguards ---
snap = {"rules": {"factors": {"C": 100, "P": 50, "N": 0}, "thresholds": {"green": 85, "yellow": 70}},
        "sections": [{"id": 1, "name": "S", "criteria": [
            {"id": 1, "text": "a", "priority": "Critical", "weight": 10, "critical": 1, "mandatory": 0},
            {"id": 2, "text": "b", "priority": "Low", "weight": 1, "critical": 0, "mandatory": 0}]}]}
r = rds.compute(snap, {"1": {"status": "C"}, "2": {"status": "P"}})
assert r["score"] == round(10.5 / 11 * 100, 2) and r["category"] == "Green"
assert rds.compute(snap, {"1": {"status": "NA"}, "2": {"status": "NA"}})["status"] == "Unscorable"
assert rds.compute(snap, {"1": {"status": "C"}})["score"] is None  # unanswered never counts as compliant
r = rds.compute(snap, {"1": {"status": "N"}, "2": {"status": "NA"}})
assert r["score"] == 0 and len(r["alerts"]) == 1

iaqc = client("iaqc", "Iaqc@Demo2026")
# 1. create centre
cid = iaqc.post("/api/centres", json={"code": "TST-01", "name": "Test Centre", "location": "Town", "district": "Testdist"}).json["id"]
# 2. create AC and assign centre
uid = iaqc.post("/api/users", json={"username": "test.ac", "name": "Test AC", "password": "Test@12345", "centre_ids": [cid]}).json["id"]
# 3. configure checklist: add a critical criterion
secs = iaqc.get("/api/checklist").json
new = iaqc.post("/api/criteria", json={"section_id": secs[0]["id"], "text": "Test critical item", "priority": "Critical", "weight": 10,
                                       "critical": True, "mandatory": True}).json["id"]
crits = [c for s in iaqc.get("/api/checklist").json for c in s["criteria"]]
assert any(c["id"] == new for c in crits)

# 4. AC submits
ac = client("test.ac", "Test@12345")
assert [c["id"] for c in ac.get("/api/centres").json] == [cid]
resp = {str(c["id"]): {"status": "C"} for c in crits}
resp[str(new)] = {"status": "N"}  # no remark -> must be rejected
r = ac.post("/api/assessments", json={"centre_id": cid, "visit_date": dt.date.today().isoformat(), "responses": resp})
assert r.status_code == 400 and "Remark required" in r.json["error"]
plain = next(c["id"] for c in crits if c["id"] != new)
del resp[str(plain)]
resp[str(new)] = {"status": "N", "remark": "Observed issue"}
assert ac.post("/api/assessments", json={"centre_id": cid, "visit_date": dt.date.today().isoformat(), "responses": resp}).status_code == 400  # incomplete
resp[str(plain)] = {"status": "C"}
r = ac.post("/api/assessments", json={"centre_id": cid, "visit_date": dt.date.today().isoformat(), "responses": resp})
assert r.status_code == 200, r.json
aid = r.json["id"]

# 5-6. score computed and centre ranked (critical alert -> top)
total = sum(c["weight"] for c in crits)
rank = iaqc.get("/api/ranking").json["centres"]
row = next(x for x in rank if x["id"] == cid)
assert row["score"] == round((total - 10) / total * 100, 2) and row["alerts"]
assert row["rank"] <= 3
assert next(x for x in rank if x["code"] == "DEMO-KKD-02")["category"] == "Not Assessed"

# 7. scorecard shows full report
a = iaqc.get(f"/api/assessments/{aid}").json
assert any(i["remark"] == "Observed issue" for i in a["items"])
assert a["alerts"][0]["verification"] == "Reported - Pending Verification"

# 9. checklist change does not alter the old report
iaqc.put(f"/api/criteria/{new}", json={"section_id": secs[0]["id"], "text": "Changed", "priority": "Low", "weight": 1, "active": False})
a2 = iaqc.get(f"/api/assessments/{aid}").json
assert a2["score"] == a["score"] and a2["checklist_version"] == a["checklist_version"]
iaqc.post(f"/api/assessments/{aid}/reviews", json={"outcome": "Resolved", "note": "Checked", "criterion_id": new})
assert iaqc.get(f"/api/assessments/{aid}").json["items"] == a["items"]  # original preserved

# 8 & 10. CMD read-only, AC restricted
cmd = client("cmd", "Cmd@Demo2026")
assert cmd.get(f"/api/centres/{cid}/scorecard").status_code == 200
for c, method, path in [(cmd, "post", "/api/centres"), (cmd, "put", "/api/settings"), (cmd, "post", "/api/criteria"), (cmd, "get", "/api/users"),
                        (cmd, "post", "/api/assessments"), (ac, "get", "/api/ranking"), (ac, "post", "/api/users"), (ac, "put", f"/api/centres/{cid}"),
                        (ac, "get", f"/api/assessments/{aid}"), (ac, "put", "/api/settings")]:
    assert getattr(c, method)(path, json={}).status_code == 403, (method, path)
other = next(x for x in rank if x["code"] == "DEMO-TVM-01")["id"]
assert ac.post("/api/assessments", json={"centre_id": other, "visit_date": dt.date.today().isoformat(), "responses": resp}).status_code == 403
assert rds.app.test_client().get("/api/ranking").status_code == 401

# deactivated user is locked out, even mid-session
iaqc.put(f"/api/users/{uid}", json={"name": "Test AC", "active": False})
assert ac.get("/api/centres").status_code == 401
assert rds.app.test_client().post("/api/login", json={"username": "test.ac", "password": "Test@12345"}).status_code == 403
assert any(l["action"] == "ACCESS_DENIED" for l in iaqc.get("/api/audit").json)
print("All checks passed.")
