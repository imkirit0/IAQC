"""Creates the database and DEMO DATA. `python seed.py --reset` wipes and re-seeds."""
import json, os, sqlite3, sys, datetime as dt
from werkzeug.security import generate_password_hash
import app as rds

# Sample criteria = configurable organisational policy requirements, NOT verified existing G-TEC rules.
# (key, text, priority, critical, mandatory)
CHECKLIST = [
    ("Operations and Documentation", [
        ("ops.admin", "Centre maintains the official Admin Book.", "Medium", 0, 0),
        ("ops.ledger", "Centre maintains an updated Student Ledger.", "High", 0, 0),
        ("ops.daybook", "Centre maintains a Day Book.", "Medium", 0, 0),
        ("ops.inout", "Centre maintains a Student In-and-Out Register.", "Low", 0, 0),
        ("ops.admission", "Student admission details are properly recorded in the official management system.", "High", 0, 1),
        ("ops.fees", "Student fee collections are accurately recorded in the system.", "Critical", 1, 1),
        ("ops.receipts", "Fee receipts are issued to students.", "High", 0, 1),
        ("ops.records", "Centre records are updated and available for verification.", "Medium", 0, 0),
    ]),
    ("Financial Transparency", [
        ("fin.structure", "Student fees correspond with the approved fee structure.", "High", 0, 1),
        ("fin.extra", "No unauthorised additional charges are collected.", "Critical", 1, 1),
        ("fin.match", "Collection records match available student fee records.", "Critical", 1, 1),
        ("fin.pending", "Pending instalments and outstanding balances are properly documented.", "Medium", 0, 0),
        ("fin.discrep", "Financial discrepancies are reported and explained.", "Critical", 1, 0),
        ("fin.royalty", "Applicable royalty and other payments are properly documented.", "High", 0, 0),
    ]),
    ("Academic Quality", [
        ("acad.schedule", "Classes are conducted according to the approved academic schedule.", "High", 0, 0),
        ("acad.trainers", "Qualified or authorised trainers are assigned.", "High", 0, 0),
        ("acad.attendance", "Student attendance records are maintained.", "Medium", 0, 0),
        ("acad.materials", "Academic materials are provided according to the applicable policy.", "Medium", 0, 0),
        ("acad.exams", "Student assessments and examination procedures follow approved standards.", "High", 0, 0),
        ("acad.certs", "Student certificates are issued only through authorised procedures.", "Critical", 1, 1),
    ]),
    ("Marketing and Admissions", [
        ("mkt.brand", "Marketing materials follow approved brand guidelines.", "Medium", 0, 0),
        ("mkt.logos", "Only authorised logos, advertisements, and promotional claims are used.", "High", 0, 0),
        ("mkt.claims", "Course details and certifications are accurately represented.", "High", 0, 0),
        ("mkt.admissions", "Admissions are recorded in the official system.", "High", 0, 1),
        ("mkt.commit", "Student fee commitments are clearly communicated.", "Medium", 0, 0),
        ("mkt.discounts", "Unauthorised discounts and promotional offers are not provided.", "High", 0, 0),
    ]),
    ("Brand and Policy Compliance", [
        ("brand.agreement", "Centre follows the franchise agreement and applicable organisational policies.", "High", 0, 1),
        ("brand.premises", "Centre premises and signage meet approved brand standards.", "Medium", 0, 0),
        ("brand.identity", "Official identity and branding are used correctly.", "Medium", 0, 0),
        ("brand.unauth", "No unauthorised courses or services are promoted.", "High", 0, 0),
        ("brand.comm", "Centre follows approved communication and reporting procedures.", "Low", 0, 0),
    ]),
    ("Student Satisfaction and Service Quality", [
        ("stu.feedback", "Student feedback is collected where appropriate.", "Low", 0, 0),
        ("stu.complaints", "Student complaints are recorded and addressed.", "Medium", 0, 0),
        ("stu.info", "Students receive accurate course and fee information.", "Medium", 0, 0),
        ("stu.promised", "Students report that classes are conducted as promised.", "Medium", 0, 0),
        ("stu.concerns", "Student concerns about fees, academics, or services are documented.", "Low", 0, 0),
    ]),
]

USERS = [  # username, name, role, password, area
    ("iaqc", "IAQC Coordinator (Demo)", "iaqc", "Iaqc@Demo2026", "Head Office"),
    ("cmd", "CMD (Demo)", "cmd", "Cmd@Demo2026", "Head Office"),
    ("arjun.ac", "Arjun Menon", "ac", "Arjun@Demo2026", "Thiruvananthapuram, Kollam"),
    ("priya.ac", "Priya Nair", "ac", "Priya@Demo2026", "Ernakulam, Thrissur"),
    ("rahul.ac", "Rahul Das", "ac", "Rahul@Demo2026", "Kozhikode, Malappuram"),
]

# code, name, location, district, ac username
CENTRES = [
    ("DEMO-TVM-01", "Lakeview Skills Academy", "Kazhakoottam", "Thiruvananthapuram", "arjun.ac"),
    ("DEMO-TVM-02", "Harbour Point Computer Centre", "Vizhinjam", "Thiruvananthapuram", "arjun.ac"),
    ("DEMO-KLM-01", "Coastal Tech Learning Hub", "Karunagappally", "Kollam", "arjun.ac"),
    ("DEMO-KLM-02", "Palm Grove Institute", "Kottarakkara", "Kollam", "arjun.ac"),
    ("DEMO-EKM-01", "Metro Digital Campus", "Kakkanad", "Ernakulam", "priya.ac"),
    ("DEMO-EKM-02", "Riverside Career Point", "Aluva", "Ernakulam", "priya.ac"),
    ("DEMO-TSR-01", "Heritage Town Computer School", "Guruvayur", "Thrissur", "priya.ac"),
    ("DEMO-TSR-02", "Greenfield Learning Studio", "Chalakudy", "Thrissur", "priya.ac"),
    ("DEMO-KKD-01", "Sunrise Skill Centre", "Vadakara", "Kozhikode", "rahul.ac"),
    ("DEMO-KKD-02", "Hilltop Future Academy", "Thamarassery", "Kozhikode", "rahul.ac"),
    ("DEMO-MLP-01", "Valley Tech Institute", "Perinthalmanna", "Malappuram", "rahul.ac"),
    ("DEMO-MLP-02", "Crescent Computer Centre", "Tirur", "Malappuram", "rahul.ac"),
]

R = {  # reusable realistic remarks
    "ledger_p": "Ledger maintained but last 3 weeks of entries not posted.",
    "ledger_n": "Student Ledger not available at the time of visit; staff stated it is kept by the owner at home.",
    "receipts_p": "Receipts issued for most payments; 4 of 20 sampled cash payments had no receipt copy.",
    "receipts_n": "Manual receipts issued from an unofficial book; system receipts not generated.",
    "structure_p": "Two batches charged Rs 500 above approved structure, described as 'lab fee'.",
    "extra_n": "Students in DCA batch reported paying an additional Rs 1,500 'exam registration' charge not in the approved fee structure. Reported for verification.",
    "match_n": "Cash collected for 6 students in September not reflected in the system fee records.",
    "match_p": "Minor timing mismatches; 2 payments entered a week after collection.",
    "discrep_n": "Shortfall of approx. Rs 18,000 between day book and system collections; no explanation provided.",
    "royalty_p": "Royalty for August paid late; supporting statement not filed.",
    "royalty_n": "Royalty statements for the last two months not available.",
    "schedule_p": "Evening batch reduced from 5 to 3 days a week without approval.",
    "schedule_n": "Timetable not followed; two batches combined without approval.",
    "trainers_p": "One trainer awaiting authorisation is taking classes independently.",
    "trainers_n": "Two trainers have no record of authorisation or qualification documents.",
    "exams_p": "Internal assessment conducted without the approved question bank for one batch.",
    "exams_n": "Practical exams marked without the evaluator sheet; scores entered in bulk.",
    "certs_n": "Two students showed course certificates not traceable to the official issuance register. Suspected unauthorised issuance - pending verification by Head Office.",
    "logos_p": "Old logo still used on wall posters at the entrance.",
    "logos_n": "Social media ads use an unapproved logo variant and the claim '100% placement guaranteed'.",
    "claims_p": "Brochure lists a certification body not linked to the course.",
    "claims_n": "Flyers advertise 'government-recognised diploma' for a short-term course.",
    "admissions_p": "3 of 25 admissions not yet entered in the official system.",
    "admissions_n": "Walk-in admissions recorded only in a notebook.",
    "discounts_p": "Festival discount offered without Head Office approval.",
    "discounts_n": "Flat 40% 'referral' discount offered without approval.",
    "agreement_p": "Franchise agreement copy not displayed; renewal pending.",
    "agreement_n": "Centre operating a second unapproved branch under the same name.",
    "unauth_p": "Spoken English classes promoted alongside approved courses without approval.",
    "unauth_n": "Unapproved 'mobile repair' course promoted under the brand.",
    "records_p": "Some files kept off-site; produced after 30 minutes.",
    "admin_p": "Admin Book not updated since last month.",
    "daybook_p": "Day Book entries made in pencil for two days.",
    "premises_p": "Signboard faded; brand colours not as per guidelines.",
    "complaints_p": "Complaints recorded but no action taken column filled.",
    "complaints_n": "No complaint register maintained.",
    "info_p": "Some students unclear about total course fee.",
    "promised_p": "Students reported frequent class cancellations last month.",
    "attendance_p": "Attendance marked weekly instead of daily.",
    "materials_p": "Course books for the new batch not yet provided.",
    "pending_p": "Outstanding balances tracked in a separate spreadsheet only.",
    "commit_p": "Instalment schedule not given in writing.",
    "fees_p": "Fee collections entered in batches at month end.",
}


def P(k): return ("P", R[k])
def N(k): return ("N", R[k])


# centre code -> list of (days_ago, overrides, general remark); everything not overridden is Compliant.
ASSESSMENTS = {
    "DEMO-TVM-01": [  # Green, improving
        (160, {"ops.ledger": P("ledger_p"), "fin.royalty": P("royalty_p"), "mkt.logos": P("logos_p"), "ops.admin": P("admin_p"), "stu.info": P("info_p"),
               "acad.attendance": P("attendance_p"), "stu.complaints": P("complaints_p"), "mkt.discounts": P("discounts_p"), "acad.schedule": P("schedule_p"),
               "ops.receipts": P("receipts_p"), "ops.records": P("records_p")}, "Generally well run; documentation gaps noted."),
        (85, {"ops.ledger": P("ledger_p"), "ops.admin": P("admin_p"), "brand.premises": P("premises_p"), "acad.attendance": P("attendance_p"),
              "stu.complaints": P("complaints_p"), "mkt.discounts": P("discounts_p"), "ops.receipts": P("receipts_p"), "ops.records": P("records_p")},
         "Improvement noted in financial documentation."),
        (12, {"ops.admin": P("admin_p"), "stu.promised": P("promised_p"), "brand.premises": P("premises_p"),
              "stu.feedback": ("NA", "Feedback cycle due next month.")}, "Strong compliance overall."),
    ],
    "DEMO-TVM-02": [  # Yellow, risk rising
        (120, {"ops.ledger": P("ledger_p"), "fin.royalty": P("royalty_p"), "mkt.discounts": P("discounts_p"), "acad.attendance": P("attendance_p"),
               "stu.promised": P("promised_p"), "ops.daybook": P("daybook_p"), "mkt.claims": P("claims_p"), "acad.exams": P("exams_p"),
               "fin.structure": P("structure_p"), "brand.agreement": P("agreement_p"), "ops.records": P("records_p"), "stu.complaints": P("complaints_p"),
               "mkt.admissions": P("admissions_p"), "brand.unauth": P("unauth_p")}, ""),
        (20, {"ops.ledger": P("ledger_p"), "fin.royalty": N("royalty_n"), "mkt.discounts": P("discounts_p"), "acad.attendance": P("attendance_p"),
              "stu.promised": P("promised_p"), "acad.schedule": P("schedule_p"), "ops.receipts": P("receipts_p"), "mkt.claims": P("claims_p"),
              "acad.exams": P("exams_p"), "fin.structure": P("structure_p"), "brand.agreement": P("agreement_p"), "ops.records": P("records_p"),
              "stu.complaints": P("complaints_p"), "mkt.admissions": P("admissions_p"), "brand.unauth": P("unauth_p"), "acad.trainers": P("trainers_p"),
              "mkt.commit": P("commit_p")}, "Procedural gaps increasing since last visit."),
    ],
    "DEMO-KLM-01": [  # Green, stable
        (140, {"ops.daybook": P("daybook_p"), "brand.premises": P("premises_p"), "fin.pending": P("pending_p")}, ""),
        (30, {"ops.daybook": P("daybook_p"), "stu.complaints": P("complaints_p")}, "Well maintained centre."),
    ],
    "DEMO-KLM-02": [  # Green, with N/A items
        (25, {"acad.exams": ("NA", "No batch due for exams this term."), "fin.royalty": ("NA", "Royalty holiday period for new franchise."),
              "stu.feedback": ("NA", "First batch started only two weeks ago."), "mkt.logos": P("logos_p")}, "New centre; several items not yet applicable."),
    ],
    "DEMO-EKM-01": [  # High score but CRITICAL ALERT
        (95, {"brand.premises": P("premises_p"), "stu.info": P("info_p"), "ops.ledger": P("ledger_p"), "acad.attendance": P("attendance_p"),
              "mkt.logos": P("logos_p")}, ""),
        (9, {"fin.extra": N("extra_n"), "stu.info": P("info_p")},
         "Centre is otherwise well organised. Additional charge reported by students needs Head Office verification."),
    ],
    "DEMO-EKM-02": [  # Yellow -> Red, worsening
        (170, {"ops.ledger": P("ledger_p"), "ops.receipts": P("receipts_p"), "fin.structure": P("structure_p"), "fin.royalty": P("royalty_p"),
               "mkt.discounts": P("discounts_p"), "acad.schedule": P("schedule_p"), "mkt.logos": P("logos_p"), "stu.complaints": P("complaints_p"),
               "ops.records": P("records_p"), "acad.attendance": P("attendance_p"), "acad.exams": P("exams_p"), "brand.agreement": P("agreement_p"),
               "mkt.claims": P("claims_p"), "mkt.admissions": P("admissions_p"), "brand.unauth": P("unauth_p")}, ""),
        (90, {"ops.ledger": N("ledger_n"), "ops.receipts": P("receipts_p"), "fin.structure": P("structure_p"), "fin.royalty": N("royalty_n"),
              "mkt.discounts": P("discounts_p"), "acad.schedule": P("schedule_p"), "mkt.logos": P("logos_p"), "stu.complaints": P("complaints_p"),
              "acad.trainers": P("trainers_p"), "fin.match": P("match_p"), "acad.exams": P("exams_p"), "brand.agreement": P("agreement_p"),
              "mkt.claims": P("claims_p"), "mkt.admissions": P("admissions_p"), "brand.unauth": P("unauth_p")}, "Repeated gaps from previous visit."),
        (15, {"ops.ledger": N("ledger_n"), "ops.receipts": N("receipts_n"), "fin.structure": P("structure_p"), "fin.royalty": N("royalty_n"),
              "mkt.discounts": N("discounts_n"), "acad.schedule": N("schedule_n"), "mkt.logos": N("logos_n"), "stu.complaints": N("complaints_n"),
              "acad.trainers": P("trainers_p"), "fin.match": P("match_p"), "mkt.claims": P("claims_p"), "acad.exams": N("exams_n"),
              "brand.agreement": P("agreement_p"), "mkt.admissions": P("admissions_p"), "brand.unauth": N("unauth_n"), "fin.pending": P("pending_p"),
              "acad.attendance": P("attendance_p")}, "Significant deterioration. Recommend management meeting with franchisee."),
    ],
    "DEMO-TSR-01": [  # Yellow
        (40, {"ops.ledger": P("ledger_p"), "acad.trainers": P("trainers_p"), "mkt.claims": N("claims_n"), "brand.unauth": P("unauth_p"),
              "stu.promised": P("promised_p"), "acad.materials": P("materials_p"), "mkt.commit": P("commit_p"), "fin.royalty": P("royalty_p"),
              "acad.exams": P("exams_p"), "fin.structure": P("structure_p"), "mkt.discounts": P("discounts_p"), "brand.agreement": P("agreement_p"),
              "ops.receipts": P("receipts_p"), "stu.complaints": P("complaints_p"), "ops.records": P("records_p")}, "Marketing claims need correction."),
    ],
    "DEMO-TSR-02": [  # Green
        (18, {"ops.inout": ("P", ""), "stu.feedback": ("P", "")}, "Excellent records."),
    ],
    "DEMO-KKD-01": [  # Yellow -> Red + critical (suspected unauthorised certificates)
        (110, {"fin.discrep": N("discrep_n"), "ops.ledger": P("ledger_p"), "acad.exams": P("exams_p"), "mkt.admissions": P("admissions_p"),
               "fin.royalty": P("royalty_p"), "brand.agreement": P("agreement_p"), "ops.receipts": P("receipts_p"), "mkt.claims": P("claims_p"),
               "mkt.discounts": P("discounts_p"), "acad.schedule": P("schedule_p"), "ops.records": P("records_p"), "stu.complaints": P("complaints_p"),
               "fin.structure": P("structure_p"), "acad.trainers": P("trainers_p")}, ""),
        (6, {"acad.certs": N("certs_n"), "acad.exams": N("exams_n"), "acad.trainers": N("trainers_n"), "ops.ledger": P("ledger_p"),
             "mkt.admissions": N("admissions_n"), "fin.royalty": P("royalty_p"), "brand.agreement": P("agreement_p"), "ops.receipts": P("receipts_p"),
             "brand.unauth": N("unauth_n"), "mkt.claims": N("claims_n"), "mkt.discounts": N("discounts_n"), "acad.schedule": N("schedule_n"),
             "fin.structure": P("structure_p"), "ops.records": P("records_p"), "stu.complaints": N("complaints_n"), "mkt.logos": N("logos_n"),
             "stu.promised": P("promised_p")}, "Serious academic irregularities observed. Escalated to IAQC."),
    ],
    "DEMO-KKD-02": [],  # Not yet assessed
    "DEMO-MLP-01": [  # Green, but overdue for a visit
        (210, {"ops.ledger": P("ledger_p"), "acad.attendance": P("attendance_p"), "stu.complaints": P("complaints_p"), "mkt.logos": P("logos_p"),
               "fin.pending": P("pending_p")}, ""),
        (120, {"acad.attendance": P("attendance_p"), "brand.premises": P("premises_p"), "mkt.logos": P("logos_p")}, ""),
    ],
    "DEMO-MLP-02": [  # Yellow, improving
        (130, {"ops.ledger": N("ledger_n"), "fin.royalty": N("royalty_n"), "mkt.discounts": P("discounts_p"), "acad.schedule": P("schedule_p"),
               "ops.receipts": P("receipts_p"), "mkt.claims": P("claims_p"), "stu.info": P("info_p"), "acad.trainers": P("trainers_p"),
               "acad.exams": P("exams_p"), "brand.agreement": P("agreement_p"), "mkt.logos": N("logos_n"), "fin.structure": P("structure_p"),
               "stu.complaints": P("complaints_p"), "ops.records": P("records_p"), "brand.unauth": P("unauth_p")}, ""),
        (35, {"ops.ledger": P("ledger_p"), "fin.royalty": P("royalty_p"), "mkt.discounts": P("discounts_p"), "acad.schedule": P("schedule_p"),
              "ops.receipts": P("receipts_p"), "stu.info": P("info_p"), "mkt.commit": P("commit_p"), "ops.daybook": P("daybook_p"),
              "acad.trainers": P("trainers_p"), "mkt.logos": P("logos_p"), "fin.structure": P("structure_p"), "stu.complaints": P("complaints_p"),
              "brand.unauth": P("unauth_p"), "ops.records": P("records_p")}, "Improvement from previous visit; follow-up needed."),
    ],
}

REVIEWS = [  # centre, assessment index, criterion key or None, outcome, note
    ("DEMO-KKD-01", 0, "fin.discrep", "Resolved", "Franchisee submitted bank deposit slips covering the shortfall. Accounts team confirmed reconciliation."),
    ("DEMO-KKD-01", 1, "acad.certs", "Note", "Certificate numbers forwarded to Examination Cell for verification. Awaiting response."),
    ("DEMO-EKM-01", 1, "fin.extra", "Note", "Student statements requested. Franchisee called for clarification meeting."),
]


def init_db(reset=False):
    if reset and os.path.exists(rds.DB):
        os.remove(rds.DB)
    con = sqlite3.connect(rds.DB)
    con.executescript(rds.SCHEMA)
    if not con.execute("SELECT 1 FROM users").fetchone():
        seed(con)
        print("Database seeded with DEMO DATA.")
    con.close()


def seed(con):
    con.row_factory = sqlite3.Row
    ts = rds.now()
    for k, v in rds.DEFAULT_SETTINGS.items():
        con.execute("INSERT INTO settings VALUES(?,?)", (k, json.dumps(v)))
    pw = rds.DEFAULT_SETTINGS["priority_weights"]
    keys = {}
    for si, (sname, crit) in enumerate(CHECKLIST, 1):
        sid = con.execute("INSERT INTO sections(name, sort) VALUES(?,?)", (sname, si)).lastrowid
        for ci, (key, text, pri, critical, mand) in enumerate(crit, 1):
            keys[key] = con.execute("INSERT INTO criteria(section_id,text,priority,weight,critical,mandatory,sort) VALUES(?,?,?,?,?,?,?)",
                                    (sid, text, pri, pw[pri], critical, mand, ci)).lastrowid
    uid = {}
    for un, name, role, p, area in USERS:
        uid[un] = con.execute("INSERT INTO users(username,name,role,pw_hash,area,created_at) VALUES(?,?,?,?,?,?)",
                              (un, name, role, generate_password_hash(p), area, ts)).lastrowid
    cid = {}
    for code, name, loc, dist, ac in CENTRES:
        cid[code] = con.execute("INSERT INTO centres(code,name,location,district,ac_id,demo) VALUES(?,?,?,?,?,1)",
                                (code, name, loc, dist, uid[ac])).lastrowid

    # Snapshot built exactly as a live submission would build it.
    with rds.app.app_context():
        rds.g.db = con
        snap = rds.make_snapshot()
        rds.g.pop("db")
    all_ids = [c["id"] for s in snap["sections"] for c in s["criteria"]]
    aids = {}
    today = dt.date.today()
    for code, visits in ASSESSMENTS.items():
        ac = next(c[4] for c in CENTRES if c[0] == code)
        for i, (ago, ov, gen) in enumerate(visits):
            resp = {str(x): {"status": "C", "remark": ""} for x in all_ids}
            for k, (st, rem) in ov.items():
                resp[str(keys[k])] = {"status": st, "remark": rem}
            errs = rds.validate_responses(snap, resp)
            assert not errs, (code, errs)
            vd = today - dt.timedelta(days=ago)
            aids[(code, i)] = con.execute(
                "INSERT INTO assessments(centre_id,ac_id,visit_date,submitted_at,checklist_version,snapshot,responses,general_remarks,demo) "
                "VALUES(?,?,?,?,?,?,?,?,1)", (cid[code], uid[ac], vd.isoformat(), f"{vd.isoformat()}T17:30:00", snap["version"],
                                               json.dumps(snap), json.dumps(resp), gen)).lastrowid
    for code, i, key, outcome, note in REVIEWS:
        con.execute("INSERT INTO reviews(assessment_id,criterion_id,user_id,at,outcome,note) VALUES(?,?,?,?,?,?)",
                    (aids[(code, i)], keys[key] if key else None, uid["iaqc"], ts, outcome, note))
    con.execute("INSERT INTO audit_log(at,username,action,detail) VALUES(?,?,?,?)", (ts, "system", "DEMO_SEED", "Demo data loaded"))
    con.commit()


if __name__ == "__main__":
    init_db(reset="--reset" in sys.argv)
    con = sqlite3.connect(rds.DB)
    con.row_factory = sqlite3.Row
    for a in con.execute("SELECT a.*, c.code FROM assessments a JOIN centres c ON c.id=a.centre_id ORDER BY c.code, visit_date"):
        r = rds.compute(json.loads(a["snapshot"]), json.loads(a["responses"]))
        print(f"{a['code']:12} {a['visit_date']}  {r['score']:6}  {r['category']:7} alerts={len(r['alerts'])}")
