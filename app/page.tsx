"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

/** =======================
 * Types
 * ======================= */
type CoachingRecord = { id: string; date: string; notes: string };
type SideRecord = { id: string; date: string; notes: string };
type TechRecord = { id: string; date: string; score: string };

type FollowUpItem = { id: string; text: string };

type Agent = {
  id: string;
  name: string;
  requirement: number;
  coachings: CoachingRecord[];
  sides: SideRecord[];
  techs: TechRecord[];

  notes: string; // sticky per agent
  followUps: FollowUpItem[]; // sticky per agent
};

type ModalKind = "coachings" | "sides" | "techs";
type RecordsModalState = { agentId: string; kind: ModalKind } | null;

type AgentModalMode = "add" | "edit";
type AgentModalState = { mode: AgentModalMode; agentId?: string } | null;

type NotesModalState = { agentId: string } | null;
type FollowUpsModalState = { agentId: string } | null;

type ConfirmState =
  | {
      title: string;
      body: string;
      confirmText?: string;
      danger?: boolean;
      onConfirm: () => void;
    }
  | null;

type SortKey =
  | "name"
  | "completion"
  | "coachings"
  | "sides"
  | "techs"
  | "requirement"
  | "score"
  | "followups";

/** =======================
 * Storage Keys
 * ======================= */
const STORAGE_KEY = "agents";
const BACKUP_KEY = "agents_backup_pre_migration";

// NEW: instructions persistence
const INSTRUCTIONS_DISMISSED_KEY = "agent_tracker_instructions_dismissed";

/** =======================
 * Small helpers
 * ======================= */
function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function safeJsonParse(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseLegacyLine(line: string) {
  const idx = line.indexOf(":");
  if (idx === -1) return { date: "", notes: String(line ?? "").trim() };
  const date = line.slice(0, idx).trim();
  const notes = line.slice(idx + 1).trim();
  return { date, notes };
}

/**
 * Migrate any older shapes into current Agent shape.
 * - Supports old string-array records
 * - Adds notes/followUps if missing
 */
function migrateAgents(raw: any): Agent[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((a: any) => {
    const id = typeof a?.id === "string" ? a.id : uid();
    const name = typeof a?.name === "string" ? a.name : "Unnamed";

    const requirement = Number.isFinite(a?.requirement)
      ? clampInt(Number(a.requirement), 0, 99)
      : 2;

    const coachingsRaw = Array.isArray(a?.coachings) ? a.coachings : [];
    const sidesRaw = Array.isArray(a?.sides) ? a.sides : [];
    const techsRaw = Array.isArray(a?.techs) ? a.techs : [];

    const coachings: CoachingRecord[] = coachingsRaw.map((x: any) => {
      if (typeof x === "string") {
        const { date, notes } = parseLegacyLine(x);
        return { id: uid(), date, notes };
      }
      return {
        id: typeof x?.id === "string" ? x.id : uid(),
        date: typeof x?.date === "string" ? x.date : "",
        notes: typeof x?.notes === "string" ? x.notes : "",
      };
    });

    const sides: SideRecord[] = sidesRaw.map((x: any) => {
      if (typeof x === "string") {
        const { date, notes } = parseLegacyLine(x);
        return { id: uid(), date, notes };
      }
      return {
        id: typeof x?.id === "string" ? x.id : uid(),
        date: typeof x?.date === "string" ? x.date : "",
        notes: typeof x?.notes === "string" ? x.notes : "",
      };
    });

    const techs: TechRecord[] = techsRaw.map((x: any) => {
      if (typeof x === "string") {
        const s = x.trim();
        const cleaned = s.toLowerCase().startsWith("score:")
          ? s.slice(6).trim()
          : s;
        return { id: uid(), date: "", score: cleaned };
      }
      return {
        id: typeof x?.id === "string" ? x.id : uid(),
        date: typeof x?.date === "string" ? x.date : "",
        score: typeof x?.score === "string" ? x.score : "",
      };
    });

    const notes = typeof a?.notes === "string" ? a.notes : "";
    const followUpsRaw = Array.isArray(a?.followUps) ? a.followUps : [];
    const followUps: FollowUpItem[] = followUpsRaw
      .map((x: any) => {
        if (typeof x === "string") return { id: uid(), text: x };
        return {
          id: typeof x?.id === "string" ? x.id : uid(),
          text: typeof x?.text === "string" ? x.text : "",
        };
      })
      .filter((x: any) => x.text.trim().length > 0);

    return { id, name, requirement, coachings, sides, techs, notes, followUps };
  });
}

/** =======================
 * Component
 * ======================= */
export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);

  const [recordsModal, setRecordsModal] = useState<RecordsModalState>(null);
  const [agentModal, setAgentModal] = useState<AgentModalState>(null);
  const [notesModal, setNotesModal] = useState<NotesModalState>(null);
  const [followUpsModal, setFollowUpsModal] = useState<FollowUpsModalState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  // NEW: instructions modal
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsDontShowAgain, setInstructionsDontShowAgain] = useState(false);
  const [showDetailedBpaSteps, setShowDetailedBpaSteps] = useState(false);

  // compact toolbar state
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Records modal form state
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recDate, setRecDate] = useState("");
  const [recNotes, setRecNotes] = useState("");
  const [recScore, setRecScore] = useState("");

  // Agent modal form state
  const [agentName, setAgentName] = useState("");
  const [agentRequirement, setAgentRequirement] = useState<number>(2);

  // Notes modal state
  const [draftAgentNotes, setDraftAgentNotes] = useState("");

  // FollowUps modal state
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");

  const didInitialLoad = useRef(false);
  const didWriteMigratedOnce = useRef(false);

  const importBpaInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);

  /** =======================
   * Load + migrate localStorage
   * ======================= */
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(saved);

    const migrated = migrateAgents(parsed);
    setAgents(migrated);
    didInitialLoad.current = true;

    const looksLegacy =
      Array.isArray(parsed) &&
      parsed.some((a: any) => {
        const hasId = typeof a?.id === "string";
        const coachHasString =
          Array.isArray(a?.coachings) && a.coachings.some((x: any) => typeof x === "string");
        const sideHasString =
          Array.isArray(a?.sides) && a.sides.some((x: any) => typeof x === "string");
        const techHasString =
          Array.isArray(a?.techs) && a.techs.some((x: any) => typeof x === "string");
        const missingNotes = typeof a?.notes !== "string";
        const missingFollowUps = !Array.isArray(a?.followUps);
        return !hasId || coachHasString || sideHasString || techHasString || missingNotes || missingFollowUps;
      });

    if (saved && looksLegacy) {
      if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      didWriteMigratedOnce.current = true;
    }

    // NEW: show instructions on first load unless dismissed
    const dismissed = localStorage.getItem(INSTRUCTIONS_DISMISSED_KEY) === "1";
    if (!dismissed) setInstructionsOpen(true);
  }, []);

  /** =======================
   * Auto-save on changes (after initial load)
   * ======================= */
  useEffect(() => {
    if (!didInitialLoad.current) return;
    if (didWriteMigratedOnce.current) {
      didWriteMigratedOnce.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  }, [agents]);

  /** =======================
   * Escape closes top-most modal
   * ======================= */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirm) return setConfirm(null);
      if (instructionsOpen) return closeInstructionsModal(false);
      if (agentModal) return closeAgentModal();
      if (recordsModal) return closeRecordsModal();
      if (notesModal) return closeNotesModal();
      if (followUpsModal) return closeFollowUpsModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, agentModal, recordsModal, notesModal, followUpsModal, instructionsOpen, instructionsDontShowAgain]);

  /** =======================
   * Instructions modal
   * ======================= */
  function openInstructionsModal() {
    setInstructionsDontShowAgain(false); // don’t pre-check when opened manually
    setShowDetailedBpaSteps(false);
    setInstructionsOpen(true);
  }

  function closeInstructionsModal(persistDontShowAgain: boolean) {
    if (persistDontShowAgain) {
      localStorage.setItem(INSTRUCTIONS_DISMISSED_KEY, "1");
    }
    setInstructionsOpen(false);
  }

  function resetInstructionsForeverDismiss() {
    localStorage.removeItem(INSTRUCTIONS_DISMISSED_KEY);
    openInstructionsModal();
  }

  /** =======================
   * Scoring + totals
   * ======================= */
  const colorCodes: { [key: number]: string } = {
    0: "#6b0f1a",
    25: "#7a2e0e",
    66: "#6e6a00",
    100: "#0f6b3a",
    110: "#0b5ed7",
  };

  const scoreValue = (a: Agent) => {
    const ts = a.techs.length;
    const cs = a.coachings.length;
    const ss = a.sides.length;
    return ((cs + ss) / (a.requirement + 1)) * 100 + (ts > 0 ? 10 : 0);
  };

  const getScoreColor = (a: Agent): string => {
    const score = scoreValue(a);
    let cc = "#111827";
    Object.keys(colorCodes).forEach((k) => {
      const keyNum = parseInt(k, 10);
      if (score >= keyNum) cc = colorCodes[keyNum];
    });
    return cc;
  };

  const completionPct = (a: Agent) =>
    ((a.coachings.length + a.sides.length) / (a.requirement + 1)) * 100;

  const totals = useMemo(() => {
    const coach = agents.reduce((acc, a) => acc + a.coachings.length, 0);
    const sides = agents.reduce((acc, a) => acc + a.sides.length, 0);
    const techs = agents.reduce((acc, a) => acc + a.techs.length, 0);
    const denom = agents.length + agents.reduce((acc, a) => acc + a.requirement, 0);
    const pct = denom ? ((coach + sides) / denom) * 100 : 0;
    return { coach, sides, techs, pct };
  }, [agents]);

  /** =======================
   * Search + sort
   * ======================= */
  const filteredSortedAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = agents;

    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));

    const dir = sortDir === "asc" ? 1 : -1;

    const cmp = (x: Agent, y: Agent) => {
      switch (sortKey) {
        case "name":
          return x.name.localeCompare(y.name) * dir;
        case "completion":
          return (completionPct(x) - completionPct(y)) * dir;
        case "coachings":
          return (x.coachings.length - y.coachings.length) * dir;
        case "sides":
          return (x.sides.length - y.sides.length) * dir;
        case "techs":
          return (x.techs.length - y.techs.length) * dir;
        case "requirement":
          return (x.requirement - y.requirement) * dir;
        case "score":
          return (scoreValue(x) - scoreValue(y)) * dir;
        case "followups":
          return ((x.followUps?.length ?? 0) - (y.followUps?.length ?? 0)) * dir;
        default:
          return 0;
      }
    };

    return [...list].sort((a, b) => {
      const primary = cmp(a, b);
      if (primary !== 0) return primary;
      return a.name.localeCompare(b.name);
    });
  }, [agents, query, sortKey, sortDir]);

  /** =======================
   * Sidebar actions
   * ======================= */
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    alert("Data saved!");
  }

  function clearData() {
    setConfirm({
      title: "Clear all data?",
      body: "This will remove all agents + records from localStorage. (A backup may exist if you migrated.)",
      confirmText: "Clear",
      danger: true,
      onConfirm: () => {
        localStorage.removeItem(STORAGE_KEY);
        setAgents([]);
        setConfirm(null);
      },
    });
  }

  // NEW MONTH: keep agents/requirements + sticky fields; wipe only records
  function clearRecordsKeepAgents() {
    setConfirm({
      title: "New month, fresh slate?",
      body: "This clears ALL coachings, sides, and tech monitors for every agent — but keeps your team, requirements, notes, and follow ups.",
      confirmText: "Clear records",
      danger: true,
      onConfirm: () => {
        // close any open modals
        setRecordsModal(null);
        setEditingRecordId(null);
        setRecDate("");
        setRecNotes("");
        setRecScore("");

        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            coachings: [],
            sides: [],
            techs: [],
          }))
        );
        setConfirm(null);
      },
    });
  }

  /** =======================
   * Agent modal
   * ======================= */
  function openAddAgent() {
    setAgentName("");
    setAgentRequirement(2);
    setAgentModal({ mode: "add" });
  }

  function openEditAgent(agentId: string) {
    const a = agents.find((x) => x.id === agentId);
    if (!a) return;
    setAgentName(a.name);
    setAgentRequirement(a.requirement);
    setAgentModal({ mode: "edit", agentId });
  }

  function closeAgentModal() {
    setAgentModal(null);
    setAgentName("");
    setAgentRequirement(2);
  }

  function submitAgentModal() {
    const name = agentName.trim();
    if (!name) return;
    const req = clampInt(Number(agentRequirement), 0, 99);

    if (agentModal?.mode === "add") {
      const newAgent: Agent = {
        id: uid(),
        name,
        requirement: req,
        coachings: [],
        sides: [],
        techs: [],
        notes: "",
        followUps: [],
      };
      setAgents((prev) => [...prev, newAgent]);
      closeAgentModal();
      return;
    }

    if (agentModal?.mode === "edit" && agentModal.agentId) {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentModal.agentId ? { ...a, name, requirement: req } : a))
      );
      closeAgentModal();
    }
  }

  function deleteAgent(agentId: string) {
    const a = agents.find((x) => x.id === agentId);
    if (!a) return;

    setConfirm({
      title: "Delete agent?",
      body: `This will delete "${a.name}" and all their records, notes, and follow ups.`,
      confirmText: "Delete",
      danger: true,
      onConfirm: () => {
        setAgents((prev) => prev.filter((x) => x.id !== agentId));
        setConfirm(null);
      },
    });
  }

  /** =======================
   * Records modal (coachings/sides/techs)
   * ======================= */
  function openRecords(agentId: string, kind: ModalKind) {
    setRecordsModal({ agentId, kind });
    setEditingRecordId(null);
    setRecDate("");
    setRecNotes("");
    setRecScore("");
  }

  function closeRecordsModal() {
    setRecordsModal(null);
    setEditingRecordId(null);
    setRecDate("");
    setRecNotes("");
    setRecScore("");
  }

  function getRecords(agent: Agent, kind: ModalKind) {
    if (kind === "coachings") return agent.coachings;
    if (kind === "sides") return agent.sides;
    return agent.techs;
  }

  function startEditRecord(recordId: string) {
    if (!recordsModal) return;
    const a = agents.find((x) => x.id === recordsModal.agentId);
    if (!a) return;

    if (recordsModal.kind === "coachings") {
      const r = a.coachings.find((x) => x.id === recordId);
      if (!r) return;
      setEditingRecordId(recordId);
      setRecDate(r.date);
      setRecNotes(r.notes);
      setRecScore("");
      return;
    }

    if (recordsModal.kind === "sides") {
      const r = a.sides.find((x) => x.id === recordId);
      if (!r) return;
      setEditingRecordId(recordId);
      setRecDate(r.date);
      setRecNotes(r.notes);
      setRecScore("");
      return;
    }

    const r = a.techs.find((x) => x.id === recordId);
    if (!r) return;
    setEditingRecordId(recordId);
    setRecDate(r.date);
    setRecScore(r.score);
    setRecNotes("");
  }

  function cancelEditRecord() {
    setEditingRecordId(null);
    setRecDate("");
    setRecNotes("");
    setRecScore("");
  }

  function upsertRecord() {
    if (!recordsModal) return;
    const a = agents.find((x) => x.id === recordsModal.agentId);
    if (!a) return;

    const kind = recordsModal.kind;
    const id = editingRecordId ?? uid();

    if (kind === "coachings") {
      const date = recDate.trim();
      const notes = recNotes.trim();
      if (!notes) return;

      const next: CoachingRecord = { id, date, notes };

      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.id !== a.id) return agent;
          const exists = agent.coachings.some((x) => x.id === id);
          return {
            ...agent,
            coachings: exists
              ? agent.coachings.map((x) => (x.id === id ? next : x))
              : [next, ...agent.coachings],
          };
        })
      );
      cancelEditRecord();
      return;
    }

    if (kind === "sides") {
      const date = recDate.trim();
      const notes = recNotes.trim();
      if (!notes) return;

      const next: SideRecord = { id, date, notes };

      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.id !== a.id) return agent;
          const exists = agent.sides.some((x) => x.id === id);
          return {
            ...agent,
            sides: exists
              ? agent.sides.map((x) => (x.id === id ? next : x))
              : [next, ...agent.sides],
          };
        })
      );
      cancelEditRecord();
      return;
    }

    // techs
    const date = recDate.trim();
    const score = recScore.trim();
    if (!score) return;

    const next: TechRecord = { id, date, score };

    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.id !== a.id) return agent;
        const exists = agent.techs.some((x) => x.id === id);
        return {
          ...agent,
          techs: exists ? agent.techs.map((x) => (x.id === id ? next : x)) : [next, ...agent.techs],
        };
      })
    );
    cancelEditRecord();
  }

  function deleteRecord(recordId: string) {
    if (!recordsModal) return;
    const a = agents.find((x) => x.id === recordsModal.agentId);
    if (!a) return;

    const kind = recordsModal.kind;

    setConfirm({
      title: "Delete record?",
      body: "This will permanently remove the selected record.",
      confirmText: "Delete",
      danger: true,
      onConfirm: () => {
        setAgents((prev) =>
          prev.map((agent) => {
            if (agent.id !== a.id) return agent;
            if (kind === "coachings") return { ...agent, coachings: agent.coachings.filter((x) => x.id !== recordId) };
            if (kind === "sides") return { ...agent, sides: agent.sides.filter((x) => x.id !== recordId) };
            return { ...agent, techs: agent.techs.filter((x) => x.id !== recordId) };
          })
        );
        setConfirm(null);
        if (editingRecordId === recordId) cancelEditRecord();
      },
    });
  }

  /** =======================
   * Notes modal
   * ======================= */
  function openNotesModal(agentId: string) {
    const a = agents.find((x) => x.id === agentId);
    if (!a) return;
    setDraftAgentNotes(a.notes ?? "");
    setNotesModal({ agentId });
  }

  function closeNotesModal() {
    setNotesModal(null);
    setDraftAgentNotes("");
  }

  function saveNotesModal() {
    if (!notesModal) return;
    const nextNotes = draftAgentNotes;
    setAgents((prev) => prev.map((a) => (a.id === notesModal.agentId ? { ...a, notes: nextNotes } : a)));
    closeNotesModal();
  }

  /** =======================
   * FollowUps modal
   * ======================= */
  function openFollowUpsModal(agentId: string) {
    setEditingFollowUpId(null);
    setFollowUpText("");
    setFollowUpsModal({ agentId });
  }

  function closeFollowUpsModal() {
    setFollowUpsModal(null);
    setEditingFollowUpId(null);
    setFollowUpText("");
  }

  function startEditFollowUp(itemId: string) {
    if (!followUpsModal) return;
    const a = agents.find((x) => x.id === followUpsModal.agentId);
    if (!a) return;
    const item = a.followUps.find((f) => f.id === itemId);
    if (!item) return;
    setEditingFollowUpId(itemId);
    setFollowUpText(item.text);
  }

  function cancelEditFollowUp() {
    setEditingFollowUpId(null);
    setFollowUpText("");
  }

  function upsertFollowUp() {
    if (!followUpsModal) return;
    const text = followUpText.trim();
    if (!text) return;

    const id = editingFollowUpId ?? uid();

    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== followUpsModal.agentId) return a;
        const exists = a.followUps.some((f) => f.id === id);
        const nextItem: FollowUpItem = { id, text };
        return {
          ...a,
          followUps: exists ? a.followUps.map((f) => (f.id === id ? nextItem : f)) : [nextItem, ...a.followUps],
        };
      })
    );

    cancelEditFollowUp();
  }

  function deleteFollowUp(itemId: string) {
    if (!followUpsModal) return;

    setConfirm({
      title: "Delete follow up?",
      body: "This will remove the selected follow up item.",
      confirmText: "Delete",
      danger: true,
      onConfirm: () => {
        setAgents((prev) =>
          prev.map((a) => {
            if (a.id !== followUpsModal.agentId) return a;
            return { ...a, followUps: a.followUps.filter((f) => f.id !== itemId) };
          })
        );
        setConfirm(null);
        if (editingFollowUpId === itemId) cancelEditFollowUp();
      },
    });
  }

  /** =======================
   * BPA Import (unchanged from your working version)
   * ======================= */
  async function importBPAReport(file: File) {
    const mod: any = await import("xlsx");
    const XLSX: any = mod?.default ?? mod;

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {
      type: "array",
      raw: false,
      cellDates: true,
    });

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(ws, {
      raw: false,
      defval: "",
    }) as any[];

    if (rows.length === 0) {
      alert("No data found in the Excel file.");
      return;
    }

    const normKey = (k: string) => String(k).replace(/\u00A0/g, " ").trim().toLowerCase();

    const pick = (r: any, key: string) => {
      const nKey = normKey(key);
      if (r[key]) return r[key];
      for (const [k, v] of Object.entries(r)) {
        if (normKey(k) === nKey) return v;
      }
      return "";
    };

    const normalizeAgentName = (s: string) => {
      const str = String(s || "").trim();
      const m = str.match(/^([^,]+),\s*(.+)$/);
      if (!m) return str;
      return `${m[2]} ${m[1]}`.trim();
    };

    const agentByName = new Map<string, Agent>();
    for (const a of agents) agentByName.set(a.name.toLowerCase(), a);

    const nextAgents = [...agents];

    const ensureAgent = (nameRaw: string) => {
      const name = normalizeAgentName(nameRaw);
      const key = name.toLowerCase();
      let a = agentByName.get(key);
      if (a) return a;

      a = {
        id: uid(),
        name,
        requirement: 2,
        coachings: [],
        sides: [],
        techs: [],
        notes: "",
        followUps: [],
      };
      nextAgents.push(a);
      agentByName.set(key, a);
      return a;
    };

    const makeRecordId = (id: any) => `bpa_${String(id).trim()}`;

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const bpaId = pick(row, "Id");
      if (!bpaId) continue;

      const agentName = pick(row, "Agent Name");
      const formName = pick(row, "Coaching Form Name");
      const dt = pick(row, "Date Time");
      const createdBy = pick(row, "Created By Name");
      const teamLeader = pick(row, "Team Leader");

      if (!agentName) continue;

      const formLower = String(formName || "").toLowerCase();
      const kind =
        formLower.includes("side")
          ? ("sides" as const)
          : formLower.includes("scheduled coaching") || formLower.includes("coaching")
          ? ("coachings" as const)
          : null;

      if (!kind) continue;

      const a = ensureAgent(agentName);
      const recId = makeRecordId(bpaId);

      const exists =
        kind === "coachings"
          ? a.coachings.some((x) => x.id === recId)
          : a.sides.some((x) => x.id === recId);

      if (exists) {
        skipped++;
        continue;
      }

      const date = String(dt || "").trim();

      const notes = `BPA import • ${String(formName).trim()} • TL: ${String(teamLeader).trim()} • By: ${String(
        createdBy
      ).trim()} • ID ${String(bpaId).trim()}`;

      if (kind === "coachings") a.coachings.unshift({ id: recId, date, notes });
      else a.sides.unshift({ id: recId, date, notes });

      imported++;
    }

    setAgents(nextAgents);

    alert(
      `BPA import complete.\n` +
        `Sheet: ${sheetName}\n` +
        `Rows read: ${rows.length}\n` +
        `Imported: ${imported}\n` +
        `Skipped (dupes): ${skipped}`
    );
  }

  /** =======================
   * JSON Export/Import
   * ======================= */
  function exportJsonToDisk() {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        agents,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-tracker_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed.");
      console.error(e);
    }
  }

  async function importJsonFromDisk(file: File) {
    try {
      const text = await file.text();
      const parsed = safeJsonParse(text);

      const maybeAgents = Array.isArray(parsed) ? parsed : parsed?.agents;
      const migrated = migrateAgents(maybeAgents);

      if (!Array.isArray(migrated)) {
        alert("Invalid file.");
        return;
      }

      setConfirm({
        title: "Load JSON file?",
        body: "This will replace your current in-app data with the contents of the JSON file.",
        confirmText: "Load",
        danger: true,
        onConfirm: () => {
          setAgents(migrated);
          setConfirm(null);
        },
      });
    } catch (e) {
      alert("Import failed. (Bad JSON?)");
      console.error(e);
    }
  }

  /** =======================
   * Sidebar buttons
   * ======================= */
  const options = useMemo(
    () => [
      { name: "Instructions", onClick: openInstructionsModal, icon: "ℹ️", hint: "How to" },
      { name: "Add Agent", onClick: openAddAgent, icon: "👤", hint: "New" },
      { name: "Save", onClick: saveData, icon: "💾", hint: "Write" },
      { name: "New Month", onClick: clearRecordsKeepAgents, icon: "🧹", hint: "Wipe recs" },
      { name: "Export JSON", onClick: exportJsonToDisk, icon: "⬇️", hint: "Disk" },
      { name: "Import JSON", onClick: () => importJsonInputRef.current?.click(), icon: "⬆️", hint: "Load" },
      { name: "Clear All", onClick: clearData, icon: "🗑️", hint: "Reset" },
      { name: "Import BPA Report", onClick: () => importBpaInputRef.current?.click(), icon: "📊", hint: "XLSX" },
    ],
    [agents]
  );

  /** =======================
   * Modal derived values
   * ======================= */
  const recordsModalAgent = recordsModal ? agents.find((x) => x.id === recordsModal.agentId) : null;
  const recordsModalTitle =
    recordsModal?.kind === "coachings"
      ? "Coachings"
      : recordsModal?.kind === "sides"
      ? "Sides"
      : "Tech Monitors";

  const notesModalAgent = notesModal ? agents.find((x) => x.id === notesModal.agentId) : null;
  const followUpsModalAgent = followUpsModal ? agents.find((x) => x.id === followUpsModal.agentId) : null;

  /** =======================
   * Render
   * ======================= */
  return (
    <div id="root">
      <style jsx>{`
        :global(html, body) {
          height: 100%;
        }
        #root {
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 10% 10%, rgba(99, 102, 241, 0.32), transparent 60%),
            radial-gradient(900px 500px at 90% 30%, rgba(168, 85, 247, 0.22), transparent 60%),
            linear-gradient(135deg, #0b1220 0%, #0f172a 55%, #111827 100%);
          color: #e5e7eb;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
            "Apple Color Emoji", "Segoe UI Emoji";
        }

        .appShell {
          height: 100vh;
          width: 100vw;
          display: grid;
          grid-template-columns: 220px 1fr;
        }

        .sidebar {
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          padding: 10px;
          background: rgba(15, 23, 42, 0.62);
          backdrop-filter: blur(10px);
        }
        .brand {
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 10px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 10px;
        }
        .brandTitle {
          font-weight: 900;
          letter-spacing: 0.3px;
          line-height: 1.1;
          font-size: 13px;
        }
        .brandSub {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 2px;
        }
        .navList {
          display: grid;
          gap: 8px;
        }
        .navBtn {
          width: 100%;
          display: grid;
          grid-template-columns: 34px 1fr;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border-radius: 14px;
          cursor: pointer;
          user-select: none;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #e5e7eb;
          transition: transform 160ms ease, background 160ms ease, border 160ms ease;
        }
        .navBtn:hover {
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
        }
        .navIcon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: rgba(99, 102, 241, 0.18);
          border: 1px solid rgba(99, 102, 241, 0.22);
          font-size: 14px;
        }
        .navText {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          text-align: left;
        }
        .navTitle {
          font-weight: 800;
          font-size: 12px;
        }
        .navHint {
          font-size: 11px;
          opacity: 0.7;
        }

        .main {
          padding: 10px;
          overflow: hidden;
        }
        .card {
          height: calc(100vh - 20px);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(10px);
          display: grid;
          grid-template-rows: auto 1fr;
          overflow: hidden;
        }

        .cardHeader {
          padding: 10px 10px 8px 10px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.35);
        }
        .title {
          display: flex;
          gap: 10px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .title h1 {
          margin: 0;
          font-size: 14px;
          letter-spacing: 0.2px;
          font-weight: 900;
        }
        .meta {
          font-size: 11px;
          opacity: 0.75;
        }

        .controls {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .controlInput,
        .controlSelect {
          height: 32px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          color: #e5e7eb;
          padding: 0 10px;
          outline: none;
          font-size: 12px;
        }
        .controlInput::placeholder {
          color: rgba(229, 231, 235, 0.6);
        }
        .controlBtn {
          height: 32px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          color: #e5e7eb;
          padding: 0 10px;
          cursor: pointer;
          font-weight: 900;
          font-size: 12px;
          transition: transform 140ms ease, background 140ms ease;
        }
        .controlBtn:hover {
          background: rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
        }

        .tableWrap {
          padding: 8px 10px 10px 10px;
          overflow: hidden;
        }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }

        thead th {
          position: sticky;
          top: 0;
          z-index: 5;
          text-align: left;
          font-size: 11px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 8px 6px;
          background: rgba(17, 24, 39, 0.75);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          white-space: nowrap;
        }

        tbody td {
          padding: 6px 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.055);
          vertical-align: middle;
          white-space: nowrap;
        }

        tbody tr:hover td {
          background: rgba(255, 255, 255, 0.03);
        }

        .agentCell {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 190px;
        }
        .dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
          flex: 0 0 auto;
        }
        .agentName {
          font-weight: 900;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 150px;
        }
        .tag {
          font-size: 10px;
          opacity: 0.85;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
        }

        .pillRow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .badgeButton {
          min-width: 34px;
          height: 26px;
          padding: 0 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #e5e7eb;
          cursor: pointer;
          transition: transform 140ms ease, background 140ms ease;
          font-size: 12px;
        }
        .badgeButton:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.14);
        }

        .miniBtn {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
          cursor: pointer;
          font-weight: 900;
          display: grid;
          place-items: center;
          transition: transform 140ms ease, background 140ms ease;
          font-size: 13px;
        }
        .miniBtn:hover {
          background: rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
        }

        .right {
          text-align: right;
        }

        .rowActions {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          justify-content: flex-end;
        }
        .iconBtn {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: background 140ms ease, transform 140ms ease;
          font-size: 12px;
        }
        .iconBtn:hover {
          background: rgba(255, 255, 255, 0.10);
          transform: translateY(-1px);
        }
        .iconBtnDanger:hover {
          background: rgba(239, 68, 68, 0.18);
          border-color: rgba(239, 68, 68, 0.22);
        }

        tfoot td {
          padding: 7px 6px;
          font-weight: 900;
          background: rgba(17, 24, 39, 0.32);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 12px;
        }

        .ghostBtn {
          height: 28px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          cursor: pointer;
          padding: 0 10px;
          font-weight: 900;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: transform 140ms ease, background 140ms ease;
        }
        .ghostBtn:hover {
          background: rgba(255, 255, 255, 0.10);
          transform: translateY(-1px);
        }
        .tinyDot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          display: inline-block;
          background: rgba(255, 255, 255, 0.7);
          box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.18);
        }

        .emptyState {
          padding: 12px;
          border-radius: 12px;
          border: 1px dashed rgba(255, 255, 255, 0.18);
          opacity: 0.75;
          background: rgba(255, 255, 255, 0.05);
          margin-top: 10px;
          font-size: 12px;
        }

        /* Modals */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
          display: grid;
          place-items: center;
          z-index: 99999;
          padding: 14px;
        }
        .modalCard {
          width: min(820px, 94vw);
          max-height: min(86vh, 820px);
          overflow: hidden;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.98);
          color: #111827;
          border: 1px solid rgba(17, 24, 39, 0.12);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
        }
        .modalHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 12px 8px 12px;
          border-bottom: 1px solid rgba(17, 24, 39, 0.08);
          background: rgba(99, 102, 241, 0.10);
        }
        .modalTitle {
          font-weight: 900;
          letter-spacing: 0.3px;
          font-size: 13px;
        }
        .modalSub {
          font-size: 11px;
          opacity: 0.75;
          margin-top: 3px;
          white-space: pre-wrap;
        }
        .modalClose {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 1px solid rgba(17, 24, 39, 0.12);
          background: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          font-weight: 900;
        }

        .modalBody {
          padding: 12px;
          overflow: auto;
          max-height: calc(min(86vh, 820px) - 62px);
        }

        .twoCol {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 900px) {
          .twoCol {
            grid-template-columns: 1fr;
          }
          .appShell {
            grid-template-columns: 1fr;
          }
          .main {
            overflow: auto;
          }
          .card {
            height: auto;
          }
        }

        .panel {
          border: 1px solid rgba(17, 24, 39, 0.10);
          border-radius: 14px;
          background: rgba(17, 24, 39, 0.03);
          overflow: hidden;
        }
        .panelHeader {
          padding: 10px 10px;
          border-bottom: 1px solid rgba(17, 24, 39, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.55);
        }
        .panelTitle {
          font-weight: 900;
          font-size: 12px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }

        .form {
          padding: 10px;
          display: grid;
          gap: 8px;
        }
        .field {
          display: grid;
          gap: 5px;
        }
        .label {
          font-size: 11px;
          opacity: 0.8;
          font-weight: 800;
        }
        .input {
          height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(17, 24, 39, 0.14);
          padding: 0 10px;
          outline: none;
          background: #fff;
        }
        .textarea {
          border-radius: 12px;
          border: 1px solid rgba(17, 24, 39, 0.14);
          padding: 9px 10px;
          outline: none;
          background: #fff;
          min-height: 140px;
          resize: vertical;
        }
        .formRow {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          flex-wrap: wrap;
          align-items: center;
        }
        .btn {
          height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(17, 24, 39, 0.14);
          padding: 0 10px;
          cursor: pointer;
          font-weight: 900;
          background: rgba(17, 24, 39, 0.04);
          font-size: 12px;
        }
        .btnPrimary {
          border-color: rgba(99, 102, 241, 0.35);
          background: rgba(99, 102, 241, 0.14);
        }
        .btnDanger {
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.12);
          color: #7f1d1d;
        }

        .list {
          padding: 10px;
          display: grid;
          gap: 8px;
        }
        .item {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(17, 24, 39, 0.10);
          border-radius: 12px;
          padding: 9px 10px;
          display: grid;
          gap: 6px;
        }
        .itemTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .itemMain {
          font-weight: 900;
          font-size: 12px;
          white-space: normal;
        }
        .itemMeta {
          font-size: 11px;
          opacity: 0.75;
        }
        .itemActions {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .tinyBtn {
          height: 30px;
          border-radius: 10px;
          border: 1px solid rgba(17, 24, 39, 0.14);
          padding: 0 10px;
          cursor: pointer;
          font-weight: 900;
          background: rgba(17, 24, 39, 0.03);
          font-size: 12px;
        }
        .tinyBtnDanger {
          border-color: rgba(239, 68, 68, 0.28);
          background: rgba(239, 68, 68, 0.10);
          color: #7f1d1d;
        }

        /* Instruction content helpers */
        .kicker {
          font-size: 12px;
          font-weight: 900;
          margin: 0 0 6px 0;
        }
        .p {
          font-size: 12px;
          margin: 0;
          line-height: 1.35;
          opacity: 0.9;
        }
        .ul {
          margin: 8px 0 0 18px;
          padding: 0;
          font-size: 12px;
          line-height: 1.35;
        }
        .li {
          margin: 6px 0;
        }
        .muted {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 8px;
          white-space: pre-wrap;
        }
        .linkBtn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          font-weight: 900;
          font-size: 12px;
          color: #1d4ed8;
          text-decoration: underline;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(17, 24, 39, 0.14);
          background: rgba(17, 24, 39, 0.04);
          font-size: 11px;
          font-weight: 900;
        }
      `}</style>

      <div className="appShell">
        <aside className="sidebar">
          <div className="brand">
            <div className="navIcon">📈</div>
            <div>
              <div className="brandTitle">Agent Tracker</div>
              <div className="brandSub">compact • modal CRUD • sticky notes</div>
            </div>
          </div>

          <div className="navList">
            {options.map((o) => (
              <button key={o.name} className="navBtn" onClick={o.onClick}>
                <div className="navIcon">{o.icon}</div>
                <div className="navText">
                  <div className="navTitle">{o.name}</div>
                  <div className="navHint">{o.hint}</div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 11 }}>
            <button className="linkBtn" onClick={resetInstructionsForeverDismiss} title="Show instructions automatically again">
              Reset instructions auto-show
            </button>
          </div>
        </aside>

        <main className="main">
          <div className="card">
            <div className="cardHeader">
              <div className="title">
                <h1>Agents</h1>
                <div className="meta">
                  {filteredSortedAgents.length}/{agents.length} shown • overall {totals.pct.toFixed(2)}%
                </div>
              </div>

              <div className="controls">
                <input
                  className="controlInput"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search agents…"
                  style={{ width: 170 }}
                />

                <select className="controlSelect" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="name">Name</option>
                  <option value="completion">Completion %</option>
                  <option value="score">Score</option>
                  <option value="coachings">Coachings</option>
                  <option value="sides">Sides</option>
                  <option value="techs">Tech monitors</option>
                  <option value="followups">Follow ups</option>
                  <option value="requirement">Requirement</option>
                </select>

                <button className="controlBtn" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                  {sortDir === "asc" ? "↑" : "↓"}
                </button>

                {query.trim() && (
                  <button className="controlBtn" onClick={() => setQuery("")} title="Clear search">
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Coach</th>
                    <th>Sides</th>
                    <th>Tech</th>
                    <th>Notes</th>
                    <th>Follow</th>
                    <th className="right">Comp</th>
                    <th className="right">Act</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSortedAgents.map((a) => {
                    const rowColor = getScoreColor(a);
                    const sidesColor =
                      a.sides.length >= a.requirement ? "#16a34a" : a.sides.length > 0 ? "#eab308" : "#ef4444";

                    const hasNotes = (a.notes ?? "").trim().length > 0;
                    const fuCount = a.followUps?.length ?? 0;

                    return (
                      <tr key={a.id} style={{ background: `linear-gradient(90deg, ${rowColor}1f, transparent)` }}>
                        <td>
                          <div className="agentCell">
                            <div className="dot" style={{ background: rowColor }} />
                            <div className="agentName" title={a.name}>
                              {a.name}
                            </div>
                            <div className="tag" title="Sides required">
                              req {a.requirement}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="pillRow">
                            <button className="badgeButton" onClick={() => openRecords(a.id, "coachings")}>
                              {a.coachings.length}
                            </button>
                            <button className="miniBtn" onClick={() => openRecords(a.id, "coachings")} title="Manage">
                              +
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="pillRow">
                            <button
                              className="badgeButton"
                              onClick={() => openRecords(a.id, "sides")}
                              style={{ background: `${sidesColor}22`, borderColor: `${sidesColor}44` }}
                            >
                              {a.sides.length}
                            </button>
                            <button className="miniBtn" onClick={() => openRecords(a.id, "sides")} title="Manage">
                              +
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="pillRow">
                            <button
                              className="badgeButton"
                              onClick={() => openRecords(a.id, "techs")}
                              style={{ background: "rgba(59,130,246,0.16)", borderColor: "rgba(59,130,246,0.26)" }}
                            >
                              {a.techs.length}
                            </button>
                            <button className="miniBtn" onClick={() => openRecords(a.id, "techs")} title="Manage">
                              +
                            </button>
                          </div>
                        </td>

                        <td>
                          <button className="ghostBtn" onClick={() => openNotesModal(a.id)} title="Open notes">
                            📝 Notes {hasNotes && <span className="tinyDot" />}
                          </button>
                        </td>

                        <td>
                          <button className="ghostBtn" onClick={() => openFollowUpsModal(a.id)} title="Open follow ups">
                            ✅ {fuCount}
                          </button>
                        </td>

                        <td className="right" style={{ fontWeight: 900, fontSize: 12 }}>
                          {completionPct(a).toFixed(1)}%
                        </td>

                        <td className="right">
                          <div className="rowActions">
                            <button className="iconBtn" title="Edit agent" onClick={() => openEditAgent(a.id)}>
                              ✏️
                            </button>
                            <button className="iconBtn iconBtnDanger" title="Delete agent" onClick={() => deleteAgent(a.id)}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{totals.coach}</td>
                    <td>{totals.sides}</td>
                    <td>{totals.techs}</td>
                    <td />
                    <td />
                    <td className="right">{totals.pct.toFixed(1)}%</td>
                    <td />
                  </tr>
                </tfoot>
              </table>

              {agents.length === 0 && <div className="emptyState">No agents yet. Use “Add Agent”.</div>}
              {agents.length > 0 && filteredSortedAgents.length === 0 && (
                <div className="emptyState">No matches for “{query.trim()}”.</div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* =======================
          INSTRUCTIONS MODAL
         ======================= */}
      {instructionsOpen && (
        <div className="modalOverlay" onMouseDown={() => closeInstructionsModal(false)} role="dialog" aria-modal="true">
          <div className="modalCard" style={{ width: "min(860px, 94vw)" }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">How to use Agent Tracker</div>
                <div className="modalSub">
                  Coachings + Sides + Tech Monitors • Sticky Notes + Follow Ups • BPA Import • New Month reset
                </div>
              </div>
              <button className="modalClose" onClick={() => closeInstructionsModal(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="panel">
                <div className="panelHeader">
                  <div className="panelTitle">Quick start</div>
                  <span className="pill">2 minutes</span>
                </div>

                <div className="form" style={{ gap: 10 }}>
                  <p className="p">
                    <b>Best first-time setup:</b> import a previous month with your full team already represented, then hit{" "}
                    <span className="pill">New Month</span> to wipe only records. Your team stays.
                  </p>

                  <ul className="ul">
                    <li className="li">
                      <b>Coachings</b> and <b>Sides</b>: click the number to manage history in a modal.
                    </li>
                    <li className="li">
                      <b>Techs</b> = Technical Monitoring. (Calling them “Techs” or “Tech Monitors” is fine.)
                    </li>
                    <li className="li">
                      <b>Notes</b>: sticky free-text per agent (whatever you want).
                    </li>
                    <li className="li">
                      <b>Follow Ups</b>: sticky list per agent (editable + removable).
                    </li>
                    <li className="li">
                      <b>New Month</b>: clears coachings/sides/techs only — keeps agents, requirements, notes, follow ups.
                    </li>
                  </ul>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                    <button className="btn btnPrimary" onClick={() => closeInstructionsModal(false)}>
                      Got it
                    </button>

                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={instructionsDontShowAgain}
                        onChange={(e) => setInstructionsDontShowAgain(e.target.checked)}
                      />
                      Don’t show this again
                    </label>

                    <button
                      className="btn"
                      onClick={() => {
                        closeInstructionsModal(instructionsDontShowAgain);
                      }}
                      title="Close (and optionally remember your choice)"
                    >
                      Close
                    </button>
                  </div>

                  <div className="muted">
                    Tip: If you dismiss forever, you can still open this anytime using the sidebar{" "}
                    <b>Instructions</b> button.
                  </div>
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div className="panel">
                <div className="panelHeader">
                  <div className="panelTitle">BPA report import</div>
                  <span className="pill">Important</span>
                </div>

                <div className="form" style={{ gap: 10 }}>
                  <p className="p">
                    The BPA report often downloads <b>janky</b>. The fix is simple:
                    <b> open it in Excel, then “Save As” a clean file named </b>
                    <span className="pill">data.xlsx</span>, then import that file here.
                  </p>

                  <div>
                    <button className="linkBtn" onClick={() => setShowDetailedBpaSteps((v) => !v)}>
                      {showDetailedBpaSteps ? "Hide detailed steps" : "Show detailed steps for downloading BPA report"}
                    </button>

                    {showDetailedBpaSteps && (
                      <div style={{ marginTop: 10 }}>
                        <div className="kicker">Detailed BPA download steps</div>
                        <ul className="ul">
                          <li className="li">
                            Navigate to{" "}
                            <span className="pill">https://evalidateqa.bpaquality.com/Coaching/OverviewList</span>
                          </li>
                          <li className="li">
                            Enter your <b>last name</b> under <b>Team Leader</b>
                          </li>
                          <li className="li">
                            Press the <b>export/download</b> button on that page (the button on the upper right hand corner of the list, says "xlsx")
                          </li>
                          <li className="li">
                            Save to your <b>Downloads</b> folder
                          </li>
                          <li className="li">
                            Open in <b>Excel</b>
                          </li>
                          <li className="li">
                            <b>Save As:</b> <span className="pill">data.xlsx</span>
                          </li>
                          <li className="li">
                            Back here: click <span className="pill">Import BPA Report</span> and select <b>data.xlsx</b>
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="muted">
                    If the import ever reads “0 rows” or fields look wrong: it’s almost always the janky-export problem.
                    Re-save in Excel and re-import.
                  </div>
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div className="panel">
                <div className="panelHeader">
                  <div className="panelTitle">Persistence</div>
                  <span className="pill">Don’t lose data</span>
                </div>

                <div className="form" style={{ gap: 10 }}>
                  <p className="p">
                    Since cache gets cleared around here: use <span className="pill">Export JSON</span> to save a backup
                    to disk. Later, use <span className="pill">Import JSON</span> to restore everything.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => closeInstructionsModal(false)}>
                  Close
                </button>
                <button className="btn btnPrimary" onClick={() => closeInstructionsModal(true)}>
                  Close + Don’t show again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          Agent Modal
         ======================= */}
      {agentModal && (
        <div className="modalOverlay" onMouseDown={closeAgentModal} role="dialog" aria-modal="true">
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">{agentModal.mode === "add" ? "Add Agent" : "Edit Agent"}</div>
                <div className="modalSub">Name + sides requirement</div>
              </div>
              <button className="modalClose" onClick={closeAgentModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="panel">
                <div className="panelHeader">
                  <div className="panelTitle">Agent</div>
                </div>
                <div className="form">
                  <div className="field">
                    <div className="label">Name</div>
                    <input
                      className="input"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="e.g., Lori"
                      autoFocus
                    />
                  </div>

                  <div className="field">
                    <div className="label">Sides requirement</div>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={99}
                      value={agentRequirement}
                      onChange={(e) => setAgentRequirement(clampInt(Number(e.target.value), 0, 99))}
                    />
                  </div>

                  <div className="formRow">
                    <button className="btn" onClick={closeAgentModal}>
                      Cancel
                    </button>
                    <button className="btn btnPrimary" onClick={submitAgentModal}>
                      {agentModal.mode === "add" ? "Add" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          Records Modal
         ======================= */}
      {recordsModal && recordsModalAgent && (
        <div className="modalOverlay" onMouseDown={closeRecordsModal} role="dialog" aria-modal="true">
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">
                  {recordsModalTitle} • {recordsModalAgent.name}
                </div>
                <div className="modalSub">Add / edit / delete records</div>
              </div>
              <button className="modalClose" onClick={closeRecordsModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="twoCol">
                <div className="panel">
                  <div className="panelHeader">
                    <div className="panelTitle">{editingRecordId ? "Edit" : "Add"}</div>
                  </div>

                  <div className="form">
                    <div className="field">
                      <div className="label">Date (optional)</div>
                      <input className="input" value={recDate} onChange={(e) => setRecDate(e.target.value)} placeholder="e.g., 2/12/2026" />
                    </div>

                    {recordsModal.kind !== "techs" ? (
                      <div className="field">
                        <div className="label">Notes</div>
                        <textarea className="textarea" value={recNotes} onChange={(e) => setRecNotes(e.target.value)} placeholder="What happened?" />
                      </div>
                    ) : (
                      <div className="field">
                        <div className="label">Score</div>
                        <input className="input" value={recScore} onChange={(e) => setRecScore(e.target.value)} placeholder="e.g., 88 or Pass" />
                      </div>
                    )}

                    <div className="formRow">
                      {editingRecordId ? (
                        <>
                          <button className="btn" onClick={cancelEditRecord}>
                            Cancel
                          </button>
                          <button className="btn btnPrimary" onClick={upsertRecord}>
                            Save
                          </button>
                        </>
                      ) : (
                        <button className="btn btnPrimary" onClick={upsertRecord}>
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panelHeader">
                    <div className="panelTitle">History</div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>{getRecords(recordsModalAgent, recordsModal.kind).length}</div>
                  </div>

                  <div className="list">
                    {getRecords(recordsModalAgent, recordsModal.kind).length === 0 ? (
                      <div className="item">
                        <div className="itemMain">No entries yet.</div>
                        <div className="itemMeta">Add one on the left.</div>
                      </div>
                    ) : (
                      getRecords(recordsModalAgent, recordsModal.kind).map((r: any) => {
                        const main =
                          recordsModal.kind === "techs" ? `Score: ${(r as TechRecord).score}` : (r as CoachingRecord | SideRecord).notes;
                        const meta = r.date ? `Date: ${r.date}` : "No date";

                        return (
                          <div key={r.id} className="item">
                            <div className="itemTop">
                              <div>
                                <div className="itemMain">{main}</div>
                                <div className="itemMeta">{meta}</div>
                              </div>

                              <div className="itemActions">
                                <button className="tinyBtn" onClick={() => startEditRecord(r.id)} title="Edit">
                                  Edit
                                </button>
                                <button className="tinyBtn tinyBtnDanger" onClick={() => deleteRecord(r.id)} title="Delete">
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          Notes Modal
         ======================= */}
      {notesModal && notesModalAgent && (
        <div className="modalOverlay" onMouseDown={closeNotesModal} role="dialog" aria-modal="true">
          <div className="modalCard" style={{ width: "min(820px, 94vw)" }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">Notes • {notesModalAgent.name}</div>
                <div className="modalSub">Sticky free-text. Use however you want.</div>
              </div>
              <button className="modalClose" onClick={closeNotesModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="panel">
                <div className="panelHeader">
                  <div className="panelTitle">Notes</div>
                </div>
                <div className="form">
                  <div className="field">
                    <div className="label">Text</div>
                    <textarea
                      className="textarea"
                      value={draftAgentNotes}
                      onChange={(e) => setDraftAgentNotes(e.target.value)}
                      placeholder="Anything you want to remember about this agent…"
                      style={{ minHeight: 220 }}
                      autoFocus
                    />
                  </div>

                  <div className="formRow">
                    <button className="btn" onClick={closeNotesModal}>
                      Cancel
                    </button>
                    <button className="btn btnPrimary" onClick={saveNotesModal}>
                      Save Notes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          Follow Ups Modal
         ======================= */}
      {followUpsModal && followUpsModalAgent && (
        <div className="modalOverlay" onMouseDown={closeFollowUpsModal} role="dialog" aria-modal="true">
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">Follow Ups • {followUpsModalAgent.name}</div>
                <div className="modalSub">Sticky list. Add / edit / delete.</div>
              </div>
              <button className="modalClose" onClick={closeFollowUpsModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="twoCol">
                <div className="panel">
                  <div className="panelHeader">
                    <div className="panelTitle">{editingFollowUpId ? "Edit" : "Add"}</div>
                  </div>

                  <div className="form">
                    <div className="field">
                      <div className="label">Follow up text</div>
                      <textarea
                        className="textarea"
                        value={followUpText}
                        onChange={(e) => setFollowUpText(e.target.value)}
                        placeholder="e.g., Watch for improvement on adherence…"
                        style={{ minHeight: 160 }}
                        autoFocus
                      />
                    </div>

                    <div className="formRow">
                      {editingFollowUpId ? (
                        <>
                          <button className="btn" onClick={cancelEditFollowUp}>
                            Cancel
                          </button>
                          <button className="btn btnPrimary" onClick={upsertFollowUp}>
                            Save
                          </button>
                        </>
                      ) : (
                        <button className="btn btnPrimary" onClick={upsertFollowUp}>
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panelHeader">
                    <div className="panelTitle">List</div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>{followUpsModalAgent.followUps.length}</div>
                  </div>

                  <div className="list">
                    {followUpsModalAgent.followUps.length === 0 ? (
                      <div className="item">
                        <div className="itemMain">No follow ups yet.</div>
                        <div className="itemMeta">Add one on the left.</div>
                      </div>
                    ) : (
                      followUpsModalAgent.followUps.map((f) => (
                        <div key={f.id} className="item">
                          <div className="itemTop">
                            <div>
                              <div className="itemMain">{f.text}</div>
                            </div>

                            <div className="itemActions">
                              <button className="tinyBtn" onClick={() => startEditFollowUp(f.id)} title="Edit">
                                Edit
                              </button>
                              <button className="tinyBtn tinyBtnDanger" onClick={() => deleteFollowUp(f.id)} title="Delete">
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          Confirm Modal
         ======================= */}
      {confirm && (
        <div className="modalOverlay" onMouseDown={() => setConfirm(null)} role="dialog" aria-modal="true">
          <div className="modalCard" style={{ width: "min(560px, 94vw)" }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="modalTitle">{confirm.title}</div>
                <div className="modalSub">{confirm.body}</div>
              </div>
              <button className="modalClose" onClick={() => setConfirm(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="formRow" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button className={`btn ${confirm.danger ? "btnDanger" : "btnPrimary"}`} onClick={confirm.onConfirm}>
                  {confirm.confirmText ?? "Confirm"}
                </button>
              </div>

              {typeof window !== "undefined" && localStorage.getItem(BACKUP_KEY) && (
                <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                  Backup detected: <code>{BACKUP_KEY}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BPA Import input */}
      <input
        ref={importBpaInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          await importBPAReport(file);
        }}
      />

      {/* JSON Import input */}
      <input
        ref={importJsonInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          await importJsonFromDisk(file);
        }}
      />
    </div>
  );
}
