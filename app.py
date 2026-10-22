"""RDS - Risk Detection System. Flask + SQLite prototype. Run: python app.py"""
import json, os, secrets, sqlite3, datetime as dt
from functools import wraps
from flask import Flask, request, session, jsonify, g, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "rds.db")
KEYFILE = os.path.join(BASE, ".secret_key")
if not os.path.exists(KEYFILE):
    open(KEYFILE, "w").write(secrets.token_hex(32))

app = Flask(__name__, static_folder="static", static_url_path="")
app.secret_key = open(KEYFILE).read().strip()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Strict")

PRIORITIES = ["Critical", "High", "Medium", "Low"]
STATUSES = ["C", "P", "N", "NA"]  # Compliant, Partially, Non-Compliant, Not Applicable

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ac','iaqc','cmd')), pw_hash TEXT NOT NULL, area TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS centres(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  location TEXT NOT NULL, district TEXT NOT NULL, ac_id INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sections(id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS criteria(id INTEGER PRIMARY KEY, section_id INTEGER NOT NULL REFERENCES sections(id),
  text TEXT NOT NULL, description TEXT DEFAULT '', priority TEXT NOT NULL CHECK(priority IN ('Critical','High','Medium','Low')),
  weight REAL NOT NULL CHECK(weight > 0), critical INTEGER NOT NULL DEFAULT 0, mandatory INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assessments(id INTEGER PRIMARY KEY, centre_id INTEGER NOT NULL REFERENCES centres(id),
  ac_id INTEGER NOT NULL REFERENCES users(id), visit_date TEXT NOT NULL, submitted_at TEXT NOT NULL,
  checklist_version INTEGER NOT NULL, snapshot TEXT NOT NULL, responses TEXT NOT NULL, general_remarks TEXT DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  criterion_id INTEGER, user_id INTEGER NOT NULL, at TEXT NOT NULL, outcome TEXT NOT NULL, note TEXT NOT NULL,
  corrected_status TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, username TEXT,
  action TEXT NOT NULL, detail TEXT);
CREATE TRIGGER IF NOT EXISTS assessments_immutable BEFORE UPDATE ON assessments
  BEGIN SELECT RAISE(ABORT, 'Submitted assessments are immutable'); END;
"""

DEFAULT_SETTINGS = {
    "thresholds": {"green": 85, "yellow": 70},
    "factors": {"C": 100, "P": 50, "N": 0},
    "priority_weights": {"Critical": 10, "High": 6, "Medium": 3, "Low": 1},
    "visit_cycle_days": 60,
    "checklist_version": 1,
}


def now():
    return dt.datetime.now().isoformat(timespec="seconds")


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d:
        d.close()


def rows(sql, *a):
    return [dict(r) for r in db().execute(sql, a).fetchall()]


def one(sql, *a):
    r = db().execute(sql, a).fetchone()
    return dict(r) if r else None


def get_settings():
    s = dict(DEFAULT_SETTINGS)
    for r in rows("SELECT key, value FROM settings"):
        s[r["key"]] = json.loads(r["value"])
    return s


def set_setting(k, v):
    db().execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                 (k, json.dumps(v)))


def bump_version():
    set_setting("checklist_version", get_settings()["checklist_version"] + 1)


def audit(action, detail=""):
    u = session.get("user") or {}
    db().execute("INSERT INTO audit_log(at,user_id,username,action,detail) VALUES(?,?,?,?,?)",
                 (now(), u.get("id"), u.get("username"), action, detail))


class ApiError(Exception):
    def __init__(self, msg, code=400):
        self.msg, self.code = msg, code


@app.errorhandler(ApiError)
def api_error(e):
    return jsonify(error=e.msg), e.code


@app.errorhandler(sqlite3.IntegrityError)
def integrity_error(e):
    msg = str(e)
    if "UNIQUE" in msg:
        msg = "A record with this " + msg.split(".")[-1] + " already exists."
    return jsonify(error=msg), 400


def roles(*allowed):
    def deco(f):
        @wraps(f)
        def inner(*a, **k):
            u = session.get("user")
            if not u:
                raise ApiError("Not logged in", 401)
            live = one("SELECT active, role FROM users WHERE id=?", u["id"])
            if not live or not live["active"] or live["role"] != u["role"]:
                session.clear()
                raise ApiError("Account inactive", 401)
            if u["role"] not in allowed:
                audit("ACCESS_DENIED", f"{request.method} {request.path}")
                db().commit()
                raise ApiError("You do not have permission for this action", 403)
            return f(*a, **k)
        return inner
    return deco


def body(*required):
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        raise ApiError("JSON body required")
    for k in required:
        if d.get(k) in (None, "") or (isinstance(d.get(k), str) and not d[k].strip()):
            raise ApiError(f"'{k}' is required")
    return d


def clean(s, n=500):
    return str(s or "").strip()[:n]


# ---------------- Scoring engine ----------------

def category(score, th):
    if score is None:
        return "Unscorable"
    if score >= th["green"]:
        return "Green"
    if score >= th["yellow"]:
        return "Yellow"
    return "Red"


def compute(snap, responses):
    """Pure function: snapshot (checklist + rules at submission time) + responses -> full, traceable score."""
    rules = snap["rules"]
    f, th = rules["factors"], rules["thresholds"]
    counts = {"C": 0, "P": 0, "N": 0, "NA": 0, "unanswered": 0}
    sections, items, alerts = [], [], []
    te = tm = 0.0
    for s in snap["sections"]:
        se = sm = 0.0
        viol = 0
        for c in s["criteria"]:
            r = responses.get(str(c["id"])) or {}
            st = r.get("status")
            pts = None
            if st not in STATUSES:
                counts["unanswered"] += 1
                st = None
            else:
                counts[st] += 1
                if st != "NA":
                    pts = c["weight"] * f[st] / 100
                    se += pts
                    sm += c["weight"]
                    if st in ("N", "P"):
                        viol += 1
            alert = bool(c["critical"] and st == "N")
            if alert:
                alerts.append({"criterion_id": c["id"], "text": c["text"], "section": s["name"], "remark": r.get("remark", "")})
            items.append({**c, "section": s["name"], "status": st, "points": pts, "remark": r.get("remark", ""), "alert": alert})
        sc = round(se / sm * 100, 2) if sm else None
        sections.append({"id": s["id"], "name": s["name"], "earned": round(se, 2), "max": sm, "score": sc,
                         "category": category(sc, th), "violations": viol})
        te += se
        tm += sm
    complete = counts["unanswered"] == 0
    score = round(te / tm * 100, 2) if (tm and complete) else None
    status = "Incomplete" if not complete else ("Unscorable" if not tm else "Scored")
    return {"score": score, "risk": None if score is None else round(100 - score, 2),
            "category": category(score, th) if complete else "Incomplete", "status": status,
            "earned": round(te, 2), "max": tm, "counts": counts, "assessed": counts["C"] + counts["P"] + counts["N"],
            "sections": sections, "items": items, "alerts": alerts, "thresholds": th, "factors": f}


def current_checklist(include_inactive=False):
    q = "" if include_inactive else " WHERE active=1"
    secs = rows(f"SELECT * FROM sections{q} ORDER BY sort, id")
    for s in secs:
        s["criteria"] = rows(f"SELECT * FROM criteria WHERE section_id=?{'' if include_inactive else ' AND active=1'} ORDER BY sort, id", s["id"])
    return secs


def make_snapshot():
    st = get_settings()
    secs = [s for s in current_checklist() if s["criteria"]]
    keep = ("id", "text", "description", "priority", "weight", "critical", "mandatory")
    return {"version": st["checklist_version"],
            "rules": {"factors": st["factors"], "thresholds": st["thresholds"]},
            "sections": [{"id": s["id"], "name": s["name"], "criteria": [{k: c[k] for k in keep} for c in s["criteria"]]} for s in secs]}


def validate_responses(snap, resp):
    errors = []
    for s in snap["sections"]:
        for c in s["criteria"]:
            r = resp.get(str(c["id"])) or {}
            st, rem = r.get("status"), clean(r.get("remark"), 2000)
            if st not in STATUSES:
                errors.append(f"Not answered: {c['text']}")
            elif st == "NA" and c["mandatory"]:
                errors.append(f"Mandatory criterion cannot be Not Applicable: {c['text']}")
            elif needs_remark(c, st) and not rem:
                errors.append(f"Remark required: {c['text']}")
    return errors


def needs_remark(c, st):
    return st == "N" or (st == "P" and (c["critical"] or c["priority"] in ("Critical", "High")))


def assessment_summary(a, full=False):
    res = compute(json.loads(a["snapshot"]), json.loads(a["responses"]))
    out = {k: a[k] for k in ("id", "centre_id", "ac_id", "visit_date", "submitted_at", "checklist_version", "demo")}
    out.update({k: res[k] for k in ("score", "risk", "category", "status", "counts", "assessed", "earned", "max")})
    out["alerts"] = res["alerts"]
    out["sections"] = [{k: s[k] for k in ("name", "score", "category", "violations")} for s in res["sections"]]
    if full:
        out.update(res)
        out["general_remarks"] = a["general_remarks"]
    return out


def alert_states(assessment_ids):
    """Latest verification outcome per (assessment, criterion). Original alerts stay 'Reported - pending verification' until reviewed."""
    if not assessment_ids:
        return {}
    q = ",".join("?" * len(assessment_ids))
    m = {}
    for r in rows(f"SELECT * FROM reviews WHERE assessment_id IN ({q}) AND criterion_id IS NOT NULL "
                  f"AND outcome IN ('Verified - Confirmed','Verified - Not Substantiated','Resolved') ORDER BY id", *assessment_ids):
        m[(r["assessment_id"], r["criterion_id"])] = r["outcome"]
    return m


# ---------------- Auth ----------------

@app.post("/api/login")
def login():
    d = body("username", "password")
    u = one("SELECT * FROM users WHERE username=?", clean(d["username"], 80).lower())
    if not u or not check_password_hash(u["pw_hash"], d["password"]):
        audit("LOGIN_FAILED", clean(d["username"], 80))
        db().commit()
        raise ApiError("Invalid username or password", 401)
    if not u["active"]:
        raise ApiError("This account has been deactivated", 403)
    session.clear()
    session["user"] = {"id": u["id"], "username": u["username"], "name": u["name"], "role": u["role"]}
    audit("LOGIN", u["role"])
    db().commit()
    return jsonify(session["user"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    return jsonify(session.get("user"))


@app.post("/api/me/password")
@roles("ac", "iaqc", "cmd")
def change_password():
    d = body("current", "new")
    u = one("SELECT * FROM users WHERE id=?", session["user"]["id"])
    if not check_password_hash(u["pw_hash"], d["current"]):
        raise ApiError("Current password is incorrect")
    if len(d["new"]) < 8:
        raise ApiError("New password must be at least 8 characters")
    db().execute("UPDATE users SET pw_hash=? WHERE id=?", (generate_password_hash(d["new"]), u["id"]))
    audit("PASSWORD_CHANGED", u["username"])
    db().commit()
    return jsonify(ok=True)


# ---------------- Settings & checklist ----------------

@app.get("/api/settings")
@roles("ac", "iaqc", "cmd")
def settings_get():
    return jsonify(get_settings())


@app.put("/api/settings")
@roles("iaqc")
def settings_put():
    d = body()
    th, f, pw = d.get("thresholds"), d.get("factors"), d.get("priority_weights")
    try:
        g_, y_ = float(th["green"]), float(th["yellow"])
        fac = {k: float(f[k]) for k in ("C", "P", "N")}
        pws = {k: float(pw[k]) for k in PRIORITIES}
        cycle = int(d.get("visit_cycle_days", 60))
    except (TypeError, KeyError, ValueError):
        raise ApiError("Invalid settings values")
    if not (0 < y_ < g_ <= 100):
        raise ApiError("Thresholds must satisfy 0 < Yellow < Green <= 100")
    if not (fac["C"] == 100 and 0 <= fac["N"] <= fac["P"] <= 100):
        raise ApiError("Response scoring must satisfy Compliant = 100 and 0 <= Non-Compliant <= Partial <= 100")
    if any(v <= 0 for v in pws.values()) or cycle < 1:
        raise ApiError("Weights and visit cycle must be positive")
    old = get_settings()
    set_setting("thresholds", {"green": g_, "yellow": y_})
    set_setting("factors", fac)
    set_setting("priority_weights", pws)
    set_setting("visit_cycle_days", cycle)
    if old["thresholds"] != {"green": g_, "yellow": y_} or old["factors"] != fac:
        bump_version()
    audit("SETTINGS_UPDATED", json.dumps({"thresholds": [g_, y_], "factors": fac, "weights": pws, "cycle": cycle}))
    db().commit()
    return jsonify(get_settings())


@app.get("/api/checklist")
@roles("ac", "iaqc", "cmd")
def checklist_get():
    allc = request.args.get("all") == "1" and session["user"]["role"] == "iaqc"
    return jsonify(current_checklist(include_inactive=allc))


@app.post("/api/sections")
@roles("iaqc")
def section_add():
    d = body("name")
    cur = db().execute("INSERT INTO sections(name, sort) VALUES(?,?)", (clean(d["name"], 120), int(d.get("sort") or 99)))
    bump_version()
    audit("SECTION_CREATED", clean(d["name"]))
    db().commit()
    return jsonify(id=cur.lastrowid)


@app.put("/api/sections/<int:sid>")
@roles("iaqc")
def section_edit(sid):
    d = body("name")
    if not one("SELECT id FROM sections WHERE id=?", sid):
        raise ApiError("Section not found", 404)
    db().execute("UPDATE sections SET name=?, sort=?, active=? WHERE id=?",
                 (clean(d["name"], 120), int(d.get("sort") or 0), 1 if d.get("active", True) else 0, sid))
    bump_version()
    audit("SECTION_UPDATED", f"#{sid} {clean(d['name'])} active={bool(d.get('active', True))}")
    db().commit()
    return jsonify(ok=True)


def criterion_fields(d):
    if d.get("priority") not in PRIORITIES:
        raise ApiError("Priority must be Critical, High, Medium or Low")
    try:
        w = float(d.get("weight"))
    except (TypeError, ValueError):
        raise ApiError("Weight must be a number")
    if not 0 < w <= 100:
        raise ApiError("Weight must be between 0 and 100")
    if not one("SELECT id FROM sections WHERE id=?", d.get("section_id")):
        raise ApiError("Section not found")
    return (int(d["section_id"]), clean(d["text"], 300), clean(d.get("description"), 1000), d["priority"], w,
            1 if d.get("critical") else 0, 1 if d.get("mandatory") else 0, 1 if d.get("active", True) else 0,
            int(d.get("sort") or 0))


@app.post("/api/criteria")
@roles("iaqc")
def criterion_add():
    d = body("text", "section_id", "priority")
    cur = db().execute("INSERT INTO criteria(section_id,text,description,priority,weight,critical,mandatory,active,sort) "
                       "VALUES(?,?,?,?,?,?,?,?,?)", criterion_fields(d))
    bump_version()
    audit("CRITERION_CREATED", clean(d["text"]))
    db().commit()
    return jsonify(id=cur.lastrowid)


@app.put("/api/criteria/<int:cid>")
@roles("iaqc")
def criterion_edit(cid):
    d = body("text", "section_id", "priority")
    if not one("SELECT id FROM criteria WHERE id=?", cid):
        raise ApiError("Criterion not found", 404)
    db().execute("UPDATE criteria SET section_id=?,text=?,description=?,priority=?,weight=?,critical=?,mandatory=?,active=?,sort=? "
                 "WHERE id=?", (*criterion_fields(d), cid))
    bump_version()
    audit("CRITERION_UPDATED", f"#{cid} {clean(d['text'])} [{d['priority']}, w={d.get('weight')}, critical={bool(d.get('critical'))}, active={bool(d.get('active', True))}]")
    db().commit()
    return jsonify(ok=True)


# ---------------- Centres & users ----------------

@app.get("/api/centres")
@roles("ac", "iaqc", "cmd")
def centres_get():
    u = session["user"]
    sql = ("SELECT c.*, u.name AS ac_name, (SELECT MAX(visit_date) FROM assessments a WHERE a.centre_id=c.id) AS last_visit "
           "FROM centres c LEFT JOIN users u ON u.id=c.ac_id")
    if u["role"] == "ac":
        return jsonify(rows(sql + " WHERE c.ac_id=? AND c.active=1 ORDER BY c.name", u["id"]))
    return jsonify(rows(sql + " ORDER BY c.name"))


def centre_fields(d):
    ac = d.get("ac_id") or None
    if ac and not one("SELECT id FROM users WHERE id=? AND role='ac'", ac):
        raise ApiError("Assigned user must be an Area Coordinator")
    return (clean(d["code"], 30).upper(), clean(d["name"], 150), clean(d["location"], 150), clean(d["district"], 80),
            ac, 1 if d.get("active", True) else 0)


@app.post("/api/centres")
@roles("iaqc")
def centre_add():
    d = body("code", "name", "location", "district")
    cur = db().execute("INSERT INTO centres(code,name,location,district,ac_id,active) VALUES(?,?,?,?,?,?)", centre_fields(d))
    audit("CENTRE_CREATED", f"{clean(d['code']).upper()} {clean(d['name'])}")
    db().commit()
    return jsonify(id=cur.lastrowid)


@app.put("/api/centres/<int:cid>")
@roles("iaqc")
def centre_edit(cid):
    d = body("code", "name", "location", "district")
    if not one("SELECT id FROM centres WHERE id=?", cid):
        raise ApiError("Centre not found", 404)
    db().execute("UPDATE centres SET code=?,name=?,location=?,district=?,ac_id=?,active=? WHERE id=?", (*centre_fields(d), cid))
    audit("CENTRE_UPDATED", f"#{cid} {clean(d['code']).upper()} ac={d.get('ac_id')} active={bool(d.get('active', True))}")
    db().commit()
    return jsonify(ok=True)


@app.get("/api/users")
@roles("iaqc")
def users_get():
    us = rows("SELECT id, username, name, role, area, active, created_at FROM users ORDER BY role, name")
    for u in us:
        u["centres"] = rows("SELECT id, code, name FROM centres WHERE ac_id=?", u["id"])
    return jsonify(us)


def check_pw(p):
    if len(p or "") < 8:
        raise ApiError("Temporary password must be at least 8 characters")


def assign_centres(uid, ids):
    if ids is None:
        return
    db().execute("UPDATE centres SET ac_id=NULL WHERE ac_id=?", (uid,))
    for i in ids:
        db().execute("UPDATE centres SET ac_id=? WHERE id=?", (uid, int(i)))


@app.post("/api/users")
@roles("iaqc")
def user_add():
    d = body("username", "name", "password")
    check_pw(d["password"])
    uname = clean(d["username"], 60).lower()
    if not uname.replace(".", "").replace("_", "").isalnum():
        raise ApiError("Username may contain letters, digits, '.' and '_' only")
    cur = db().execute("INSERT INTO users(username,name,role,pw_hash,area,active,created_at) VALUES(?,?,'ac',?,?,1,?)",
                       (uname, clean(d["name"], 100), generate_password_hash(d["password"]), clean(d.get("area"), 100), now()))
    assign_centres(cur.lastrowid, d.get("centre_ids"))
    audit("USER_CREATED", f"{uname} (Area Coordinator) centres={d.get('centre_ids')}")
    db().commit()
    return jsonify(id=cur.lastrowid)


@app.put("/api/users/<int:uid>")
@roles("iaqc")
def user_edit(uid):
    d = body("name")
    u = one("SELECT * FROM users WHERE id=?", uid)
    if not u:
        raise ApiError("User not found", 404)
    if u["role"] != "ac":
        raise ApiError("Only Area Coordinator accounts can be managed here", 403)
    db().execute("UPDATE users SET name=?, area=?, active=? WHERE id=?",
                 (clean(d["name"], 100), clean(d.get("area"), 100), 1 if d.get("active", True) else 0, uid))
    assign_centres(uid, d.get("centre_ids"))
    audit("USER_UPDATED", f"{u['username']} active={bool(d.get('active', True))} centres={d.get('centre_ids')}")
    db().commit()
    return jsonify(ok=True)


@app.post("/api/users/<int:uid>/reset")
@roles("iaqc")
def user_reset(uid):
    d = body("password")
    check_pw(d["password"])
    u = one("SELECT * FROM users WHERE id=? AND role='ac'", uid)
    if not u:
        raise ApiError("Area Coordinator not found", 404)
    db().execute("UPDATE users SET pw_hash=? WHERE id=?", (generate_password_hash(d["password"]), uid))
    audit("PASSWORD_RESET", u["username"])
    db().commit()
    return jsonify(ok=True)


# ---------------- Assessments ----------------

@app.post("/api/assessments")
@roles("ac")
def assessment_submit():
    d = body("centre_id", "visit_date", "responses")
    u = session["user"]
    c = one("SELECT * FROM centres WHERE id=? AND active=1", d["centre_id"])
    if not c or c["ac_id"] != u["id"]:
        raise ApiError("This centre is not assigned to you", 403)
    try:
        vd = dt.date.fromisoformat(d["visit_date"])
    except ValueError:
        raise ApiError("Invalid visit date")
    if vd > dt.date.today() or vd < dt.date.today() - dt.timedelta(days=60):
        raise ApiError("Visit date must be within the last 60 days and not in the future")
    resp = d["responses"]
    if not isinstance(resp, dict):
        raise ApiError("Invalid responses")
    snap = make_snapshot()
    # Guard against the checklist changing while the coordinator was filling it in.
    if d.get("checklist_version") not in (None, snap["version"]):
        raise ApiError("The checklist was updated while you were filling it in. Please reload the checklist and review your answers.", 409)
    errs = validate_responses(snap, resp)
    if errs:
        raise ApiError("Report incomplete: " + "; ".join(errs[:5]) + (f" (+{len(errs) - 5} more)" if len(errs) > 5 else ""))
    ids = {str(cr["id"]) for s in snap["sections"] for cr in s["criteria"]}
    resp = {k: {"status": v["status"], "remark": clean(v.get("remark"), 2000)} for k, v in resp.items() if k in ids}
    cur = db().execute("INSERT INTO assessments(centre_id,ac_id,visit_date,submitted_at,checklist_version,snapshot,responses,general_remarks) "
                       "VALUES(?,?,?,?,?,?,?,?)", (c["id"], u["id"], vd.isoformat(), now(), snap["version"], json.dumps(snap),
                                                   json.dumps(resp), clean(d.get("general_remarks"), 3000)))
    audit("ASSESSMENT_SUBMITTED", f"#{cur.lastrowid} {c['code']} visit={vd}")
    db().commit()
    return jsonify(id=cur.lastrowid, reference=f"RDS-{cur.lastrowid:05d}", submitted_at=now())


@app.get("/api/assessments")
@roles("iaqc", "cmd")
def assessments_list():
    out = []
    for a in rows("SELECT a.*, c.name AS centre_name, c.code, c.district, u.name AS ac_name FROM assessments a "
                  "JOIN centres c ON c.id=a.centre_id JOIN users u ON u.id=a.ac_id ORDER BY a.visit_date DESC, a.id DESC"):
        s = assessment_summary(a)
        s.update(centre_name=a["centre_name"], code=a["code"], district=a["district"], ac_name=a["ac_name"])
        out.append(s)
    return jsonify(out)


@app.get("/api/assessments/<int:aid>")
@roles("iaqc", "cmd")
def assessment_get(aid):
    a = one("SELECT a.*, u.name AS ac_name FROM assessments a JOIN users u ON u.id=a.ac_id WHERE a.id=?", aid)
    if not a:
        raise ApiError("Assessment not found", 404)
    s = assessment_summary(a, full=True)
    s["ac_name"] = a["ac_name"]
    s["reviews"] = rows("SELECT r.*, u.name AS reviewer FROM reviews r JOIN users u ON u.id=r.user_id WHERE assessment_id=? ORDER BY r.id", aid)
    st = alert_states([aid])
    for al in s["alerts"]:
        al["verification"] = st.get((aid, al["criterion_id"]), "Reported - Pending Verification")
    return jsonify(s)


@app.post("/api/assessments/<int:aid>/reviews")
@roles("iaqc")
def review_add(aid):
    d = body("outcome", "note")
    outcomes = ["Note", "Verified - Confirmed", "Verified - Not Substantiated", "Correction Recorded", "Resolved"]
    if d["outcome"] not in outcomes:
        raise ApiError("Invalid outcome")
    if not one("SELECT id FROM assessments WHERE id=?", aid):
        raise ApiError("Assessment not found", 404)
    cs = d.get("corrected_status") or None
    if cs and cs not in STATUSES:
        raise ApiError("Invalid corrected status")
    db().execute("INSERT INTO reviews(assessment_id,criterion_id,user_id,at,outcome,note,corrected_status) VALUES(?,?,?,?,?,?,?)",
                 (aid, d.get("criterion_id") or None, session["user"]["id"], now(), d["outcome"], clean(d["note"], 2000), cs))
    audit("REVIEW_ADDED", f"assessment #{aid} criterion={d.get('criterion_id')} {d['outcome']}")
    db().commit()
    return jsonify(ok=True)


# ---------------- Ranking & scorecard ----------------

def centre_rows(period_from=None, period_to=None, include_inactive=False):
    st = get_settings()
    cs = rows("SELECT c.*, u.name AS ac_name FROM centres c LEFT JOIN users u ON u.id=c.ac_id"
              + ("" if include_inactive else " WHERE c.active=1"))
    allas = rows("SELECT * FROM assessments ORDER BY visit_date, id")
    states = alert_states([a["id"] for a in allas])
    today = dt.date.today()
    out = []
    for c in cs:
        hist = [a for a in allas if a["centre_id"] == c["id"]
                and (not period_from or a["visit_date"] >= period_from) and (not period_to or a["visit_date"] <= period_to)]
        hs = [assessment_summary(a) for a in hist]
        latest = hs[-1] if hs else None
        prev = hs[-2] if len(hs) > 1 else None
        row = {k: c[k] for k in ("id", "code", "name", "location", "district", "ac_id", "ac_name", "active", "demo")}
        row["history"] = [{k: h[k] for k in ("id", "visit_date", "score", "category")} for h in hs]
        if latest:
            pending = [al for al in latest["alerts"] if states.get((latest["id"], al["criterion_id"])) not in
                       ("Verified - Not Substantiated", "Resolved")]
            for al in pending:
                al["verification"] = states.get((latest["id"], al["criterion_id"]), "Reported - Pending Verification")
            row.update(assessment_id=latest["id"], score=latest["score"], risk=latest["risk"], category=latest["category"],
                       last_visit=latest["visit_date"], alerts=pending, sections=latest["sections"], counts=latest["counts"],
                       reported_by=one("SELECT name FROM users WHERE id=?", latest["ac_id"])["name"])
            row["trend"] = None if not prev or prev["score"] is None or latest["score"] is None else round(latest["score"] - prev["score"], 2)
            due = (today - dt.date.fromisoformat(latest["visit_date"])).days > st["visit_cycle_days"]
        else:
            row.update(assessment_id=None, score=None, risk=None, category="Not Assessed", last_visit=None, alerts=[],
                       sections=[], counts=None, reported_by=None, trend=None)
            due = True
        row["due"] = due
        out.append(row)
    order = {"Red": 0, "Yellow": 1, "Green": 2, "Unscorable": 3, "Not Assessed": 4}
    out.sort(key=lambda r: (0 if r["alerts"] else 1, r["score"] if r["score"] is not None else 999, order.get(r["category"], 5), r["name"]))
    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out


@app.get("/api/ranking")
@roles("iaqc", "cmd")
def ranking():
    return jsonify(centres=centre_rows(request.args.get("from") or None, request.args.get("to") or None), settings=get_settings())


@app.get("/api/centres/<int:cid>/scorecard")
@roles("iaqc", "cmd")
def scorecard(cid):
    c = one("SELECT c.*, u.name AS ac_name FROM centres c LEFT JOIN users u ON u.id=c.ac_id WHERE c.id=?", cid)
    if not c:
        raise ApiError("Centre not found", 404)
    hist = rows("SELECT a.*, u.name AS ac_name FROM assessments a JOIN users u ON u.id=a.ac_id WHERE centre_id=? ORDER BY visit_date, a.id", cid)
    states = alert_states([a["id"] for a in hist])
    hs = []
    unresolved = []
    for a in hist:
        s = assessment_summary(a)
        s["ac_name"] = a["ac_name"]
        hs.append(s)
        for al in s["alerts"]:
            v = states.get((a["id"], al["criterion_id"]), "Reported - Pending Verification")
            if v not in ("Verified - Not Substantiated", "Resolved"):
                unresolved.append({**al, "assessment_id": a["id"], "visit_date": a["visit_date"], "verification": v})
    # Non-compliant items reported in an earlier visit and still non-compliant in the latest one.
    recurring = []
    if len(hist) > 1:
        snap_l, resp_l = json.loads(hist[-1]["snapshot"]), json.loads(hist[-1]["responses"])
        earlier = {}
        for a in hist[:-1]:
            for k, v in json.loads(a["responses"]).items():
                if v.get("status") == "N":
                    earlier.setdefault(k, []).append(a["visit_date"])
        for s in snap_l["sections"]:
            for cr in s["criteria"]:
                k = str(cr["id"])
                if k in earlier and (resp_l.get(k) or {}).get("status") == "N":
                    recurring.append({"text": cr["text"], "section": s["name"], "first_reported": earlier[k][0], "times": len(earlier[k]) + 1})
    return jsonify(centre=c, history=hs, unresolved=unresolved, recurring=recurring)


@app.get("/api/audit")
@roles("iaqc")
def audit_get():
    return jsonify(rows("SELECT * FROM audit_log ORDER BY id DESC LIMIT 500"))


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    import seed
    seed.init_db()
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=False)
