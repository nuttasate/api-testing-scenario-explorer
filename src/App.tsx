import { useMemo, useState } from "react";

type Scenario = {
  method: string;
  cat: string;
  id: string;
  title: string;
  expected: string;
  example: string;
  highlight?: boolean;
};

const SCENARIOS: Scenario[] = [
  // GET
  { method:"GET", cat:"Happy Path", id:"G1", title:"ดึงข้อมูลด้วย ID ที่มีอยู่", expected:"200 + resource body ครบ", example:"GET /wallets/{walletId} → ได้ยอดคงเหลือ + สถานะ wallet" },
  { method:"GET", cat:"Happy Path", id:"G2", title:"Idempotency — GET 2 ครั้ง ต้องได้ผลเหมือนกัน", expected:"200 ทั้ง 2 ครั้ง, response body เหมือนกันทุก field", example:"GET /accounts/{id} ครั้งที่ 1 และ 2 → ยอดเงินเท่ากัน" },
  { method:"GET", cat:"Happy Path", id:"G3", title:"ดึง list พร้อม pagination", expected:"200 + array + pagination metadata (total, page, limit)", example:"GET /transactions?page=1&limit=10 → transactions 10 รายการ + total count" },
  { method:"GET", cat:"Happy Path", id:"G4", title:"ดึง list พร้อม filter", expected:"200 + เฉพาะ record ที่ตรง filter เท่านั้น", example:"GET /transactions?type=transfer → ได้แค่ transaction ประเภท transfer" },
  { method:"GET", cat:"Negative", id:"G5", title:"GET ด้วย ID ที่ไม่มีในระบบ", expected:"404 + error message", example:"GET /wallets/99999999 → 404 'Wallet not found'" },
  { method:"GET", cat:"Negative", id:"G6", title:"GET โดยไม่มี token (ไม่ได้ login)", expected:"401 Unauthorized", example:"GET /accounts/{id} โดยไม่ส่ง Authorization header" },
  { method:"GET", cat:"Negative", id:"G7", title:"GET ด้วย token ที่ไม่มีสิทธิ์", expected:"403 Forbidden", example:"User role 'customer' เรียก GET /admin/users → 403" },
  { method:"GET", cat:"Negative", id:"G8", title:"GET ด้วย ID ผิด format (ส่ง string แทน number)", expected:"400 Bad Request", example:"GET /wallets/abc → 400 'Invalid walletId format'" },
  { method:"GET", cat:"Edge Case", id:"G9", title:"GET list เมื่อไม่มี record ในระบบเลย", expected:"200 + empty array [] (ไม่ใช่ 404)", example:"GET /transactions → [] ไม่ใช่ 404 หรือ error" },
  { method:"GET", cat:"Edge Case", id:"G10", title:"GET ด้วย page เกิน total pages", expected:"200 + empty array []", example:"GET /transactions?page=999 เมื่อมีแค่ 5 หน้า → []" },
  { method:"GET", cat:"Edge Case", id:"G11", title:"GET ด้วย query param ที่ API ไม่รู้จัก", expected:"200 (ignored) หรือ 400 ตาม API design", example:"GET /wallets?unknownFilter=xyz" },
  { method:"GET", cat:"Security", id:"G12", title:"IDOR — GET ทรัพยากรของ user อื่น", expected:"403 Forbidden — ห้ามเข้าถึงข้อมูล user อื่นเด็ดขาด", example:"User A ใช้ token ตัวเองเรียก GET /wallets/{walletId ของ User B} → 403", highlight:true },
  { method:"GET", cat:"Security", id:"G13", title:"Sensitive data masking ใน response", expected:"เลขบัญชี/บัตรแสดงแค่ 4 หลักสุดท้าย, ไม่มี password hash", example:"GET /accounts/{id} → accountNo: '****1234', ไม่มี field password", highlight:true },

  // POST
  { method:"POST", cat:"Happy Path", id:"P1", title:"POST ด้วย request body ถูกต้องครบถ้วน", expected:"201 Created + resource ที่สร้างใหม่พร้อม generated ID", example:"POST /transfers {amount:500, toWalletId:'...'} → 201 + transferId" },
  { method:"POST", cat:"Happy Path", id:"P2", title:"POST แล้ว GET ยืนยันว่าบันทึกจริง (Persistence)", expected:"GET หลัง POST ได้ข้อมูลตรงกัน", example:"POST /beneficiaries → GET /beneficiaries/{id} ได้ชื่อ-เลขบัญชีที่เพิ่งเพิ่ม" },
  { method:"POST", cat:"Negative", id:"P3", title:"POST โดยไม่มี token", expected:"401 Unauthorized", example:"POST /transfers โดยไม่ส่ง Authorization header" },
  { method:"POST", cat:"Negative", id:"P4", title:"POST ขาด required field", expected:"400 + ระบุว่าขาด field อะไร", example:"POST /transfers ไม่มี amount → 400 'amount is required'" },
  { method:"POST", cat:"Negative", id:"P5", title:"POST ด้วย data type ผิด", expected:"400 Bad Request", example:"POST /transfers {amount: 'five hundred'} → 400 'amount must be a number'" },
  { method:"POST", cat:"Negative", id:"P6", title:"POST ซ้ำ — duplicate resource", expected:"409 Conflict + error message", example:"POST /users ด้วย email ที่มีอยู่แล้ว → 409 'Email already exists'" },
  { method:"POST", cat:"Negative", id:"P7", title:"POST ละเมิด business rule", expected:"422 Unprocessable Entity + error message", example:"POST /transfers {amount: 99999} เมื่อ balance มีแค่ 500 → 422 'Insufficient balance'", highlight:true },
  { method:"POST", cat:"Edge Case", id:"P8", title:"POST ด้วย string เกิน max length", expected:"400 Bad Request", example:"POST /beneficiaries {nickname: 'A'.repeat(500)} → 400" },
  { method:"POST", cat:"Edge Case", id:"P9", title:"POST ด้วย special characters ใน string field", expected:"201 (บันทึกได้) หรือ 400 ตาม validation rule", example:"POST /beneficiaries {nickname: '<script>alert(1)</script>'}" },
  { method:"POST", cat:"Security", id:"P10", title:"POST พร้อม privileged fields (role, balance, is_admin)", expected:"Field เหล่านั้นถูก ignore หรือ 400 — ห้ามนำไปใช้", example:"POST /users {email:'x@x.com', role:'admin'} → สร้างได้แต่ role ต้องเป็น default ไม่ใช่ admin", highlight:true },
  { method:"POST", cat:"Security", id:"P11", title:"POST โอนเงินด้วย idempotency key ซ้ำ", expected:"ครั้งที่ 2 return ผลเดิม ไม่ตัดเงินซ้ำ", example:"POST /transfers + Idempotency-Key: abc123 ส่ง 2 ครั้ง → เงินหายแค่ครั้งเดียว", highlight:true },

  // PUT
  { method:"PUT", cat:"Happy Path", id:"U1", title:"PUT อัปเดต resource ด้วย data ครบถ้วน", expected:"200 + updated resource body", example:"PUT /profiles/{id} {name:'สมชาย', phone:'0891234567', ...} → 200" },
  { method:"PUT", cat:"Happy Path", id:"U2", title:"Idempotency — PUT ด้วยข้อมูลเดิม 2 ครั้ง", expected:"200 ทั้ง 2 ครั้ง, state เหมือนกัน", example:"PUT /profiles/{id} 2 ครั้งต่อกัน → ผลลัพธ์เหมือนกัน" },
  { method:"PUT", cat:"Happy Path", id:"U3", title:"PUT แล้ว GET ยืนยันว่าอัปเดตจริง (Persistence)", expected:"GET หลัง PUT ได้ข้อมูลใหม่", example:"PUT /profiles/{id} → GET /profiles/{id} ได้ชื่อใหม่" },
  { method:"PUT", cat:"Negative", id:"U4", title:"PUT resource ที่ไม่มีในระบบ", expected:"404 Not Found", example:"PUT /profiles/99999 → 404" },
  { method:"PUT", cat:"Negative", id:"U5", title:"PUT ขาด required field (full replace)", expected:"400 + ระบุ field ที่ขาด", example:"PUT /profiles/{id} ไม่มี name → 400 'name is required'" },
  { method:"PUT", cat:"Negative", id:"U6", title:"PUT ละเมิด business rule", expected:"422 + error message", example:"PUT /loans/{id} {status:'disbursed'} ในขณะที่ status ยังเป็น 'pending_review' → 422" },
  { method:"PUT", cat:"Security", id:"U7", title:"IDOR — PUT resource ของ user อื่น", expected:"403 Forbidden", example:"User A ใช้ token ตัวเองทำ PUT /profiles/{id ของ User B}", highlight:true },
  { method:"PUT", cat:"Security", id:"U8", title:"PUT พร้อม immutable fields (id, created_at, balance)", expected:"Field เหล่านั้นถูก ignore หรือ 400", example:"PUT /wallets/{id} {balance: 999999} → balance ต้องไม่เปลี่ยน", highlight:true },

  // PATCH
  { method:"PATCH", cat:"Happy Path", id:"A1", title:"PATCH field เดียวด้วยค่าที่ถูกต้อง", expected:"200 + เฉพาะ field นั้นอัปเดต", example:"PATCH /profiles/{id} {phone:'0899999999'} → phone ใหม่, name คงเดิม" },
  { method:"PATCH", cat:"Happy Path", id:"A2", title:"PATCH แล้ว GET ยืนยัน field ที่ไม่ได้ patch ไม่เปลี่ยน", expected:"GET หลัง PATCH → field ที่ไม่ได้ส่งต้องคงค่าเดิม", example:"PATCH {phone:...} → GET ต้อง name, email ยังเป็นค่าเดิม" },
  { method:"PATCH", cat:"Negative", id:"A3", title:"PATCH ด้วย business rule ที่ไม่ถูกต้อง (invalid status transition)", expected:"422 + error message", example:"PATCH /loans/{id} {status:'approved'} จาก 'rejected' → 422 'Invalid status transition'", highlight:true },
  { method:"PATCH", cat:"Negative", id:"A4", title:"PATCH ด้วย data type ผิด", expected:"400 Bad Request", example:"PATCH /profiles/{id} {phone: 891234567} (number แทน string) → 400" },
  { method:"PATCH", cat:"Edge Case", id:"A5", title:"PATCH ด้วย empty body {}", expected:"200 (no-op) หรือ 400 ตาม API design", example:"PATCH /profiles/{id} {} → ไม่ควร error ถ้า design ให้เป็น no-op" },
  { method:"PATCH", cat:"Edge Case", id:"A6", title:"PATCH ด้วย null value", expected:"Field ถูก clear หรือ 400 ตาม nullable contract", example:"PATCH /profiles/{id} {middleName: null} → middleName ถูกลบถ้า nullable" },
  { method:"PATCH", cat:"Security", id:"A7", title:"IDOR — PATCH resource ของ user อื่น", expected:"403 Forbidden", example:"User A ใช้ token ตัวเองทำ PATCH /profiles/{id ของ User B}", highlight:true },
  { method:"PATCH", cat:"Security", id:"A8", title:"PATCH ด้วย privileged fields (role, is_admin)", expected:"Field เหล่านั้นถูก ignore หรือ 400", example:"PATCH /profiles/{id} {role:'admin'} → role ต้องไม่เปลี่ยน", highlight:true },

  // DELETE
  { method:"DELETE", cat:"Happy Path", id:"D1", title:"DELETE resource ที่มีอยู่", expected:"200 หรือ 204 No Content", example:"DELETE /beneficiaries/{id} → 204" },
  { method:"DELETE", cat:"Happy Path", id:"D2", title:"DELETE แล้ว GET ยืนยันว่าหายไปจริง", expected:"GET หลัง DELETE → 404", example:"DELETE /beneficiaries/{id} → GET /beneficiaries/{id} ต้องได้ 404" },
  { method:"DELETE", cat:"Negative", id:"D3", title:"DELETE resource ที่ไม่มีในระบบ", expected:"404 Not Found", example:"DELETE /beneficiaries/99999 → 404" },
  { method:"DELETE", cat:"Negative", id:"D4", title:"DELETE ซ้ำ (second call หลัง delete ไปแล้ว)", expected:"404 (ไม่ใช่ 500)", example:"DELETE /beneficiaries/{id} ครั้งที่ 2 → 404 ไม่ใช่ server error", highlight:true },
  { method:"DELETE", cat:"Negative", id:"D5", title:"DELETE โดยไม่มี token", expected:"401 Unauthorized", example:"DELETE /beneficiaries/{id} โดยไม่ส่ง token" },
  { method:"DELETE", cat:"Edge Case", id:"D6", title:"DELETE resource ที่มี dependent data", expected:"409 Conflict หรือ 422 ตาม business rule", example:"DELETE /accounts/{id} ที่ยังมี active loan → 409 'Account has active dependencies'" },
  { method:"DELETE", cat:"Security", id:"D7", title:"IDOR — DELETE resource ของ user อื่น", expected:"403 Forbidden", example:"User A ใช้ token ตัวเองทำ DELETE /beneficiaries/{id ของ User B}", highlight:true },

  // Cross-Method
  { method:"Cross", cat:"General", id:"X1", title:"ส่ง HTTP method ผิด endpoint", expected:"405 Method Not Allowed", example:"POST ไปที่ GET-only endpoint เช่น POST /exchange-rates → 405" },
  { method:"Cross", cat:"Security", id:"X2", title:"ใช้ expired token", expected:"401 Unauthorized", example:"ใช้ JWT ที่หมดอายุแล้ว → 401 'Token expired'" },
  { method:"Cross", cat:"Security", id:"X3", title:"ใช้ token ที่ format ผิด (random string)", expected:"401 Unauthorized", example:"Authorization: Bearer this-is-not-a-real-token → 401" },
  { method:"Cross", cat:"Security", id:"X4", title:"Logout แล้วใช้ token เดิม", expected:"401 — token ต้องถูก invalidate ทันที", example:"POST /auth/logout → ใช้ token เดิมเรียก API → 401", highlight:true },
  { method:"Cross", cat:"Security", id:"X5", title:"Lower-privilege role ทำ admin-only action", expected:"403 Forbidden", example:"Customer role เรียก DELETE /admin/users/{id} → 403" },
  { method:"Cross", cat:"General", id:"X6", title:"Rate limit exceeded", expected:"429 Too Many Requests + Retry-After header", example:"เรียก /transfers 200 ครั้ง/นาที เกิน limit → 429" },
  { method:"Cross", cat:"General", id:"X7", title:"Error structure สม่ำเสมอทุก endpoint", expected:"error schema เหมือนกันทุก endpoint ไม่มี stack trace รั่ว", example:"400 จาก /transfers และ /accounts มี structure เดียวกัน" },
];

const METHODS = ["ทั้งหมด","GET","POST","PUT","PATCH","DELETE","Cross"];
const CATS = ["ทั้งหมด","Happy Path","Negative","Edge Case","Security","General"];

type Palette = {
  bg: string;
  border?: string;
  text: string;
};

const METHOD_COLORS: Record<string, Palette> = {
  GET:    { bg:"#E1F5EE", border:"#0F6E56", text:"#085041" },
  POST:   { bg:"#EEEDFE", border:"#534AB7", text:"#26215C" },
  PUT:    { bg:"#E6F1FB", border:"#185FA5", text:"#042C53" },
  PATCH:  { bg:"#FAEEDA", border:"#854F0B", text:"#412402" },
  DELETE: { bg:"#FAECE7", border:"#993C1D", text:"#4A1B0C" },
  Cross:  { bg:"#F1EFE8", border:"#5F5E5A", text:"#2C2C2A" },
};
const CAT_COLORS: Record<string, Palette> = {
  "Happy Path": { bg:"#EAF3DE", text:"#27500A" },
  "Negative":   { bg:"#FCEBEB", text:"#501313" },
  "Edge Case":  { bg:"#FAEEDA", text:"#412402" },
  "Security":   { bg:"#EEEDFE", text:"#26215C" },
  "General":    { bg:"#F1EFE8", text:"#2C2C2A" },
};

export default function App() {
  const [method, setMethod] = useState("ทั้งหมด");
  const [cat, setCat] = useState("ทั้งหมด");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      SCENARIOS.filter(
        (s) =>
          (method === "ทั้งหมด" || s.method === method) &&
          (cat === "ทั้งหมด" || s.cat === cat) &&
          (search === "" || s.title.includes(search) || s.example.includes(search) || s.expected.includes(search))
      ),
    [method, cat, search]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    SCENARIOS.forEach((s) => {
      c[s.method] = (c[s.method] || 0) + 1;
    });
    return c;
  }, []);

  return (
    <div style={{ fontFamily:"var(--font-sans)", padding:"0 0 2rem" }}>
      <div style={{ marginBottom:"1rem" }}>
        <p style={{ fontSize:18, fontWeight:500, margin:"0 0 4px", color:"var(--color-text-primary)" }}>
          API Testing Scenario Explorer
        </p>
        <p style={{ fontSize:13, color:"var(--color-text-secondary)", margin:0 }}>
          {filtered.length} scenario จาก {SCENARIOS.length} ทั้งหมด — คลิกที่ card เพื่อดู example
        </p>
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:"1rem" }}>
        {Object.entries(counts).map(([m, n]) => (
          <div
            key={m}
            style={{
              padding:"3px 10px",
              borderRadius:20,
              fontSize:12,
              background: METHOD_COLORS[m]?.bg,
              color: METHOD_COLORS[m]?.text,
              border: `0.5px solid ${METHOD_COLORS[m]?.border}`,
            }}
          >
            {m} {n}
          </div>
        ))}
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:"0.75rem" }}>
        {METHODS.map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            style={{
              padding:"5px 14px",
              borderRadius:20,
              fontSize:13,
              cursor:"pointer",
              background: method === m ? (METHOD_COLORS[m]?.bg || "var(--color-background-info)") : "var(--color-background-secondary)",
              color: method === m ? (METHOD_COLORS[m]?.text || "var(--color-text-info)") : "var(--color-text-secondary)",
              border:
                method === m
                  ? `1.5px solid ${METHOD_COLORS[m]?.border || "var(--color-border-info)"}`
                  : "0.5px solid var(--color-border-tertiary)",
              fontWeight: method === m ? 500 : 400,
              transition:"all .15s",
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:"1rem" }}>
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            style={{
              padding:"5px 14px",
              borderRadius:20,
              fontSize:13,
              cursor:"pointer",
              background: CAT_COLORS[c]?.bg || "var(--color-background-secondary)",
              color: cat === c ? (CAT_COLORS[c]?.text || "var(--color-text-primary)") : "var(--color-text-secondary)",
              border:
                cat === c
                  ? `1.5px solid ${CAT_COLORS[c]?.text || "var(--color-border-secondary)"}`
                  : "0.5px solid var(--color-border-tertiary)",
              fontWeight: cat === c ? 500 : 400,
              transition:"all .15s",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ค้นหา scenario, expected result, หรือ example..."
        style={{
          width:"100%",
          boxSizing:"border-box",
          marginBottom:"1rem",
          padding:"8px 12px",
          borderRadius:8,
          border:"0.5px solid var(--color-border-secondary)",
          fontSize:13,
          background:"var(--color-background-primary)",
          color:"var(--color-text-primary)",
        }}
      />

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"2rem", color:"var(--color-text-secondary)", fontSize:13 }}>
            ไม่พบ scenario ที่ตรงกัน
          </div>
        )}
        {filtered.map((s) => {
          const isOpen = expanded === s.id;
          const mc = METHOD_COLORS[s.method] || {};
          const cc = CAT_COLORS[s.cat] || {};
          return (
            <div
              key={s.id}
              onClick={() => setExpanded(isOpen ? null : s.id)}
              style={{
                border: s.highlight
                  ? `1.5px solid ${mc.border || "var(--color-border-secondary)"}`
                  : "0.5px solid var(--color-border-tertiary)",
                borderRadius:10,
                background: isOpen ? "var(--color-background-secondary)" : "var(--color-background-primary)",
                cursor:"pointer",
                transition:"all .15s",
                overflow:"hidden",
              }}
            >
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px" }}>
                <span
                  style={{
                    padding:"2px 9px",
                    borderRadius:12,
                    fontSize:11,
                    fontWeight:500,
                    whiteSpace:"nowrap",
                    background: mc.bg,
                    color: mc.text,
                    border: `0.5px solid ${mc.border}`,
                  }}
                >
                  {s.method}
                </span>
                <span
                  style={{
                    padding:"2px 9px",
                    borderRadius:12,
                    fontSize:11,
                    whiteSpace:"nowrap",
                    background: cc.bg,
                    color: cc.text,
                  }}
                >
                  {s.cat}
                </span>
                {s.highlight && (
                  <span
                    style={{
                      padding:"2px 8px",
                      borderRadius:12,
                      fontSize:10,
                      background:"#FAEEDA",
                      color:"#412402",
                      border:"0.5px solid #854F0B",
                    }}
                  >
                    ⚑ Fintech critical
                  </span>
                )}
                <span style={{ flex:1, fontSize:13, color:"var(--color-text-primary)", fontWeight: isOpen ? 500 : 400 }}>
                  {s.title}
                </span>
                <span style={{ fontSize:12, color:"var(--color-text-tertiary)" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div
                  style={{
                    borderTop:"0.5px solid var(--color-border-tertiary)",
                    padding:"12px 14px",
                    display:"flex",
                    flexDirection:"column",
                    gap:10,
                  }}
                >
                  <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                    <span
                      style={{
                        fontSize:11,
                        fontWeight:500,
                        color:"var(--color-text-secondary)",
                        minWidth:100,
                        paddingTop:1,
                      }}
                    >
                      Expected result
                    </span>
                    <span style={{ fontSize:13, color:"var(--color-text-primary)", flex:1 }}>{s.expected}</span>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                    <span
                      style={{
                        fontSize:11,
                        fontWeight:500,
                        color:"var(--color-text-secondary)",
                        minWidth:100,
                        paddingTop:1,
                      }}
                    >
                      Fintech example
                    </span>
                    <span style={{ fontSize:13, color:"var(--color-text-primary)", flex:1, fontStyle:"italic" }}>{s.example}</span>
                  </div>
                  <div
                    style={{
                      borderTop:"0.5px solid var(--color-border-tertiary)",
                      paddingTop:8,
                      display:"flex",
                      gap:8,
                      flexWrap:"wrap",
                    }}
                  >
                    <span style={{ fontSize:11, color:"var(--color-text-secondary)" }}>Assertion ที่ต้อง check:</span>
                    {["Status code ตรง", "Response body field ครบ", "Content-Type header", "Error structure (ถ้า error)"].map((a) => (
                      <span
                        key={a}
                        style={{
                          fontSize:11,
                          padding:"2px 8px",
                          borderRadius:10,
                          background:"var(--color-background-secondary)",
                          color:"var(--color-text-secondary)",
                          border:"0.5px solid var(--color-border-tertiary)",
                        }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop:"1.5rem",
          padding:"10px 14px",
          borderRadius:8,
          background:"var(--color-background-secondary)",
          fontSize:12,
          color:"var(--color-text-secondary)",
        }}
      >
        ⚑ Fintech critical = scenario ที่มีผลกระทบสูงในบริบท payment, banking, digital asset — ต้อง test ทุกครั้ง
      </div>
    </div>
  );
}
