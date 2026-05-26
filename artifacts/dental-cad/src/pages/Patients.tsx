import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useViewerStore } from "@/store/viewerStore";
import { loadScanFile } from "@/modules/loader/ScanLoader";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = "/api/patients";

export interface PatientRecord {
  id: number;
  name: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  caseNotes?: string | null;
  referringDentist?: string | null;
  treatmentPlan?: string | null;
  createdAt: string;
  updatedAt: string;
  scanCount: number;
}

export interface PatientWithScans extends PatientRecord {
  scans: ScanRef[];
}

interface ScanRef {
  id: number;
  name: string;
  fileFormat: string;
  jaw: string;
  fileSize: number;
  vertexCount: number;
  triangleCount: number;
  uploadedAt: string;
  patientDbId?: number | null;
}

async function fetchPatients(): Promise<PatientRecord[]> {
  const r = await fetch(BASE);
  if (!r.ok) throw new Error("Failed to fetch patients");
  return r.json();
}

async function fetchPatient(id: number): Promise<PatientWithScans> {
  const r = await fetch(`${BASE}/${id}`);
  if (!r.ok) throw new Error("Failed to fetch patient");
  return r.json();
}

async function fetchUnassignedScans(): Promise<ScanRef[]> {
  const r = await fetch("/api/scans");
  if (!r.ok) throw new Error("Failed to fetch scans");
  const scans: ScanRef[] = await r.json();
  return scans.filter((s) => !s.patientDbId);
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const JAW_COLOR: Record<string, string> = {
  upper: "#4d9fff", lower: "#a8ff7c", both: "#ffb87c", unknown: "#3a5060",
};

function age(dob?: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  const y = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  return isNaN(y) ? "—" : `${y} yrs`;
}

const FIELD = "text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all";
const FIELD_STYLE = { background: "#13161d", border: "1px solid #1e2530", color: "#c8d8e8" };

// ─── Patient Form ─────────────────────────────────────────────────────────────

interface PatientFormData {
  name: string;
  dateOfBirth: string;
  gender: string;
  contactPhone: string;
  contactEmail: string;
  referringDentist: string;
  caseNotes: string;
  treatmentPlan: string;
}

const EMPTY_FORM: PatientFormData = {
  name: "", dateOfBirth: "", gender: "", contactPhone: "",
  contactEmail: "", referringDentist: "", caseNotes: "", treatmentPlan: "",
};

function patientToForm(p: PatientRecord): PatientFormData {
  return {
    name: p.name,
    dateOfBirth: p.dateOfBirth ?? "",
    gender: p.gender ?? "",
    contactPhone: p.contactPhone ?? "",
    contactEmail: p.contactEmail ?? "",
    referringDentist: p.referringDentist ?? "",
    caseNotes: p.caseNotes ?? "",
    treatmentPlan: p.treatmentPlan ?? "",
  };
}

function PatientForm({
  initial, onSave, onCancel, saving,
}: {
  initial: PatientFormData;
  onSave: (d: PatientFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PatientFormData>(initial);
  const set = (k: keyof PatientFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Full Name *</label>
          <input className={FIELD} style={FIELD_STYLE} value={form.name} onChange={set("name")}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "#1e2530")} />
        </div>
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Date of Birth</label>
          <input type="date" className={FIELD} style={FIELD_STYLE} value={form.dateOfBirth} onChange={set("dateOfBirth")}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "#1e2530")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Gender</label>
          <select className={FIELD} style={FIELD_STYLE} value={form.gender} onChange={set("gender")}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Phone</label>
          <input className={FIELD} style={FIELD_STYLE} value={form.contactPhone} onChange={set("contactPhone")}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "#1e2530")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Email</label>
          <input type="email" className={FIELD} style={FIELD_STYLE} value={form.contactEmail} onChange={set("contactEmail")}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "#1e2530")} />
        </div>
        <div>
          <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Referring Dentist</label>
          <input className={FIELD} style={FIELD_STYLE} value={form.referringDentist} onChange={set("referringDentist")}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "#1e2530")} />
        </div>
      </div>

      <div>
        <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Case Notes</label>
        <textarea
          rows={3}
          className={FIELD}
          style={{ ...FIELD_STYLE, resize: "vertical" }}
          value={form.caseNotes}
          onChange={set("caseNotes")}
          onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
          onBlur={(e) => (e.target.style.borderColor = "#1e2530")}
        />
      </div>

      <div>
        <label className="text-[10px] block mb-1" style={{ color: "#3a5060" }}>Treatment Plan</label>
        <textarea
          rows={3}
          className={FIELD}
          style={{ ...FIELD_STYLE, resize: "vertical" }}
          value={form.treatmentPlan}
          onChange={set("treatmentPlan")}
          onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,255,0.4)")}
          onBlur={(e) => (e.target.style.borderColor = "#1e2530")}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-[11px] px-3 py-1.5 rounded" style={{ background: "#13161d", border: "1px solid #1e2530", color: "#4a6070" }}>
          Cancel
        </button>
        <button
          onClick={() => form.name.trim() && onSave(form)}
          disabled={saving || !form.name.trim()}
          className="text-[11px] px-4 py-1.5 rounded transition-all disabled:opacity-40"
          style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}
        >
          {saving ? "Saving..." : "Save Patient"}
        </button>
      </div>
    </div>
  );
}

// ─── Patient Detail Drawer ─────────────────────────────────────────────────────

function PatientDetail({
  patientId, onClose, onEdit, onOpenScan,
}: {
  patientId: number;
  onClose: () => void;
  onEdit: (p: PatientRecord) => void;
  onOpenScan: (scan: ScanRef) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAssign, setShowAssign] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => fetchPatient(patientId),
  });

  const { data: unassigned = [] } = useQuery({
    queryKey: ["unassigned-scans"],
    queryFn: fetchUnassignedScans,
    enabled: showAssign,
  });

  const assignMutation = useMutation({
    mutationFn: async (scanId: number) => {
      const r = await fetch(`${BASE}/${patientId}/scans/${scanId}`, { method: "POST" });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["unassigned-scans"] });
      toast({ title: "Scan linked to patient" });
    },
    onError: () => toast({ title: "Failed to link scan", variant: "destructive" }),
  });

  const unassignMutation = useMutation({
    mutationFn: async (scanId: number) => {
      const r = await fetch(`${BASE}/${patientId}/scans/${scanId}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["unassigned-scans"] });
      toast({ title: "Scan unlinked" });
    },
    onError: () => toast({ title: "Failed to unlink scan", variant: "destructive" }),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="ml-auto h-full overflow-y-auto flex flex-col"
        style={{ width: 480, background: "#0e1117", borderLeft: "1px solid #1e2530" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid #1e2530" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#c8d8e8" }}>
            {isLoading ? "Loading…" : patient?.name}
          </h2>
          <div className="flex items-center gap-2">
            {patient && (
              <button
                onClick={() => onEdit(patient)}
                className="text-[11px] px-2.5 py-1 rounded transition-all"
                style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
              >
                Edit
              </button>
            )}
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: "#4a6070" }}>✕</button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,229,255,0.2)", borderTopColor: "#00e5ff" }} />
          </div>
        ) : patient ? (
          <div className="flex flex-col gap-5 p-5">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                { label: "Age", value: age(patient.dateOfBirth) },
                { label: "Gender", value: patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : "—" },
                { label: "Phone", value: patient.contactPhone || "—" },
                { label: "Email", value: patient.contactEmail || "—" },
                { label: "Referring", value: patient.referringDentist || "—" },
                { label: "Patient Since", value: new Date(patient.createdAt).toLocaleDateString() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#2a4050" }}>{label}</p>
                  <p className="text-[11px]" style={{ color: "#7fa8c0" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Case Notes */}
            {patient.caseNotes && (
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#2a4050" }}>Case Notes</p>
                <div className="rounded p-3 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ background: "#0a0c10", border: "1px solid #1e2530", color: "#7fa8c0" }}>
                  {patient.caseNotes}
                </div>
              </div>
            )}

            {/* Treatment Plan */}
            {patient.treatmentPlan && (
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#2a4050" }}>Treatment Plan</p>
                <div className="rounded p-3 text-[11px] leading-relaxed whitespace-pre-wrap" style={{ background: "#0a0c10", border: "1px solid #1e2530", color: "#7fa8c0" }}>
                  {patient.treatmentPlan}
                </div>
              </div>
            )}

            {/* Linked Scans */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "#2a4050" }}>
                  Linked Scans ({patient.scans.length})
                </p>
                <button
                  onClick={() => setShowAssign(!showAssign)}
                  className="text-[10px] px-2 py-0.5 rounded transition-all"
                  style={{ background: showAssign ? "rgba(0,229,255,0.12)" : "#13161d", border: "1px solid rgba(0,229,255,0.25)", color: "#00e5ff" }}
                >
                  {showAssign ? "Done" : "+ Add Scan"}
                </button>
              </div>

              {showAssign && unassigned.length > 0 && (
                <div className="mb-3 rounded overflow-hidden" style={{ border: "1px solid #1e2530" }}>
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider" style={{ background: "#0a0c10", color: "#2a4050", borderBottom: "1px solid #1e2530" }}>
                    Unassigned Scans — click to link
                  </p>
                  {unassigned.map((scan) => (
                    <button
                      key={scan.id}
                      onClick={() => assignMutation.mutate(scan.id)}
                      className="w-full flex items-center justify-between px-3 py-2 transition-all"
                      style={{ borderBottom: "1px solid #0d1015" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(0,229,255,0.05)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
                    >
                      <span className="text-[11px]" style={{ color: "#7fa8c0" }}>{scan.name}</span>
                      <span className="text-[9px] uppercase" style={{ color: "#3a5060" }}>{scan.fileFormat}</span>
                    </button>
                  ))}
                  {unassigned.length === 0 && (
                    <p className="px-3 py-2 text-[11px]" style={{ color: "#2a4050" }}>All scans are already assigned</p>
                  )}
                </div>
              )}

              {patient.scans.length === 0 ? (
                <div className="rounded p-3 text-center text-[11px]" style={{ background: "#0a0c10", border: "1px dashed #1e2530", color: "#2a4050" }}>
                  No scans linked — use "+ Add Scan" above
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {patient.scans.map((scan) => (
                    <div
                      key={scan.id}
                      className="flex items-center gap-3 rounded px-3 py-2"
                      style={{ background: "#0a0c10", border: "1px solid #1e2530" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate" style={{ color: "#c8d8e8" }}>{scan.name}</p>
                        <p className="text-[10px]" style={{ color: "#3a5060" }}>
                          {scan.fileFormat.toUpperCase()} · {scan.jaw} · {formatBytes(scan.fileSize)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onOpenScan(scan)}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: "rgba(0,229,255,0.08)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.2)" }}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => unassignMutation.mutate(scan.id)}
                          className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: "rgba(255,77,77,0.06)", color: "#ff4d4d", border: "1px solid rgba(255,77,77,0.15)" }}
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main Patients Page ───────────────────────────────────────────────────────

type ModalMode = "none" | "create" | "edit";

export default function Patients() {
  const [, navigate] = useLocation();
  const { setActiveScanId, setGeometry } = useViewerStore();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalMode>("none");
  const [editTarget, setEditTarget] = useState<PatientRecord | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: patients = [], isLoading } = useQuery<PatientRecord[]>({
    queryKey: ["patients"],
    queryFn: fetchPatients,
  });

  const createMutation = useMutation({
    mutationFn: async (data: PatientFormData) => {
      const r = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: (p: PatientRecord) => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast({ title: "Patient created", description: p.name });
      setModal("none");
    },
    onError: () => toast({ title: "Failed to create patient", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PatientFormData> }) => {
      const r = await fetch(`${BASE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      if (editTarget) qc.invalidateQueries({ queryKey: ["patient", editTarget.id] });
      toast({ title: "Patient updated" });
      setModal("none");
      setEditTarget(null);
    },
    onError: () => toast({ title: "Failed to update patient", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["unassigned-scans"] });
      toast({ title: "Patient deleted" });
      if (detailId) setDetailId(null);
    },
    onError: () => toast({ title: "Failed to delete patient", variant: "destructive" }),
  });

  const openScanInViewer = useCallback(async (scan: ScanRef) => {
    setDetailId(null);
    setActiveScanId(scan.id);
    try {
      const res = await fetch(`/api/scans/${scan.id}/file`);
      const buffer = await res.arrayBuffer();
      const file = new File([buffer], `${scan.name}.${scan.fileFormat}`);
      const geo = await loadScanFile(file);
      setGeometry(geo);
      navigate("/");
    } catch {
      toast({ title: "Failed to open scan", variant: "destructive" });
    }
  }, []);

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.referringDentist?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalScans = patients.reduce((s, p) => s + p.scanCount, 0);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0a0c10", color: "#c8d8e8" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 shrink-0" style={{ height: 52, background: "#0e1117", borderBottom: "1px solid #1e2530" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-[11px] flex items-center gap-1.5 transition-colors"
            style={{ color: "#4a6070" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#00e5ff")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#4a6070")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2 L3 6 L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Viewer
          </button>
          <span style={{ color: "#1e2530" }}>/</span>
          <h1 className="text-sm font-semibold tracking-wide" style={{ color: "#c8d8e8" }}>Patient Records</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search patients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[11px] px-3 py-1.5 rounded outline-none transition-all w-48"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#c8d8e8" }}
            onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "rgba(0,229,255,0.4)")}
            onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "#1e2530")}
          />
          <button
            onClick={() => setModal("create")}
            className="text-[11px] px-3 py-1.5 rounded transition-all"
            style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}
          >
            + New Patient
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-8 px-6 py-3 shrink-0" style={{ background: "#0c0e13", borderBottom: "1px solid #1a1d24" }}>
        {[
          { label: "Total Patients", value: patients.length },
          { label: "Total Scans", value: totalScans },
          { label: "Active Cases", value: patients.filter((p) => p.scanCount > 0).length },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "#2a4050" }}>{label}</span>
            <span className="text-base font-semibold font-mono" style={{ color: "#7fa8c0" }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Patient Grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,229,255,0.2)", borderTopColor: "#00e5ff" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div style={{ color: "#1e2530" }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="18" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M8 42 C8 33.2 15.2 26 24 26 C32.8 26 40 33.2 40 42" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: "#2a4050" }}>
              {search ? "No patients match your search" : "No patients yet"}
            </p>
            {!search && (
              <button
                onClick={() => setModal("create")}
                className="text-xs px-4 py-2 rounded transition-all"
                style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "#00e5ff" }}
              >
                Create First Patient
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {filtered.map((patient) => (
              <PatientCard
                key={patient.id}
                patient={patient}
                onClick={() => setDetailId(patient.id)}
                onEdit={(p) => { setEditTarget(p); setModal("edit"); }}
                onDelete={() => deleteMutation.mutate(patient.id)}
                deleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modal !== "none" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => { setModal("none"); setEditTarget(null); }}>
          <div
            className="rounded-lg overflow-hidden w-full max-w-xl max-h-[90vh] overflow-y-auto"
            style={{ background: "#0e1117", border: "1px solid #1e2530" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #1e2530" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#c8d8e8" }}>
                {modal === "create" ? "New Patient" : `Edit — ${editTarget?.name}`}
              </h2>
              <button onClick={() => { setModal("none"); setEditTarget(null); }} style={{ color: "#4a6070" }}>✕</button>
            </div>
            <div className="p-5">
              <PatientForm
                initial={modal === "edit" && editTarget ? patientToForm(editTarget) : EMPTY_FORM}
                saving={createMutation.isPending || updateMutation.isPending}
                onCancel={() => { setModal("none"); setEditTarget(null); }}
                onSave={(data) => {
                  if (modal === "create") createMutation.mutate(data);
                  else if (editTarget) updateMutation.mutate({ id: editTarget.id, data });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detailId !== null && (
        <PatientDetail
          patientId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(p) => { setEditTarget(p); setModal("edit"); }}
          onOpenScan={openScanInViewer}
        />
      )}

      <Toaster />
    </div>
  );
}

// ─── Patient Card ─────────────────────────────────────────────────────────────

function PatientCard({
  patient, onClick, onEdit, onDelete, deleting,
}: {
  patient: PatientRecord;
  onClick: () => void;
  onEdit: (p: PatientRecord) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const initials = patient.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      className="rounded-lg overflow-hidden cursor-pointer transition-all"
      style={{ background: "#0e1117", border: "1px solid #1e2530" }}
      onClick={onClick}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,229,255,0.25)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#1e2530")}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
          style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.15)", color: "#00e5ff" }}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div>
              <p className="text-[13px] font-medium leading-tight" style={{ color: "#c8d8e8" }}>{patient.name}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#3a5060" }}>
                {age(patient.dateOfBirth)}
                {patient.gender && ` · ${patient.gender}`}
                {patient.referringDentist && ` · Dr. ${patient.referringDentist}`}
              </p>
            </div>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: patient.scanCount > 0 ? "rgba(0,229,255,0.08)" : "#13161d",
                color: patient.scanCount > 0 ? "#00e5ff" : "#2a4050",
                border: `1px solid ${patient.scanCount > 0 ? "rgba(0,229,255,0.2)" : "#1e2530"}`,
              }}
            >
              {patient.scanCount} scan{patient.scanCount !== 1 ? "s" : ""}
            </span>
          </div>

          {patient.caseNotes && (
            <p className="mt-2 text-[10px] leading-relaxed line-clamp-2" style={{ color: "#4a6070" }}>
              {patient.caseNotes}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: "1px solid #0d1015" }} onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px]" style={{ color: "#2a4050" }}>
          Added {new Date(patient.createdAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(patient); }}
            className="text-[10px] px-2 py-0.5 rounded transition-all"
            style={{ background: "#13161d", border: "1px solid #1e2530", color: "#7fa8c0" }}
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm(`Delete patient "${patient.name}"?`)) onDelete(); }}
            disabled={deleting}
            className="text-[10px] px-2 py-0.5 rounded transition-all disabled:opacity-30"
            style={{ background: "rgba(255,77,77,0.06)", border: "1px solid rgba(255,77,77,0.15)", color: "#ff4d4d" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
