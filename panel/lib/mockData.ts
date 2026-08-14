import type {
  Call,
  Callback,
  CallOutcome,
  CallStatus,
  LogEntry,
  Recording,
  Stats,
} from "./types";

// ── Deterministic pseudo-random so data is stable between renders ──
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260813);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const FIRST = [
  "Michael", "Sabine", "Thomas", "Andrea", "Stefan", "Julia", "Frank",
  "Petra", "Wolfgang", "Nicole", "Klaus", "Martina", "Jürgen", "Katrin",
  "Dieter", "Sandra", "Uwe", "Claudia", "Bernd", "Anja",
];
const LAST = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner",
  "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein",
  "Wolf", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger",
];

function germanNumber(): string {
  const area = pick(["030", "089", "040", "0221", "0211", "0711", "0511", "0341"]);
  let rest = "";
  for (let i = 0; i < 7; i++) rest += Math.floor(rand() * 10);
  return `+49 ${area.slice(1)} ${rest.slice(0, 3)} ${rest.slice(3)}`;
}

const OUTCOMES: CallOutcome[] = [
  "converted", "callback", "not_interested", "no_answer", "in_progress",
];

function statusFromOutcome(o: CallOutcome): CallStatus {
  if (o === "no_answer") return pick(["missed", "no_answer", "voicemail"]);
  if (o === "in_progress") return "answered";
  return "answered";
}

function todayAt(hour: number, min: number): Date {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d;
}

// ── Build the call list for "today" ──
function buildCalls(): Call[] {
  const calls: Call[] = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const hour = 8 + Math.floor(rand() * 11); // 08:00 - 18:59
    const min = Math.floor(rand() * 60);
    const outcome =
      rand() < 0.02
        ? "in_progress"
        : (pick([
            "converted", "converted", "callback", "callback",
            "not_interested", "not_interested", "not_interested",
            "no_answer", "no_answer",
          ]) as CallOutcome);
    const status = statusFromOutcome(outcome);
    const answered = status === "answered";
    const duration =
      outcome === "in_progress"
        ? 30 + Math.floor(rand() * 90)
        : answered
        ? 45 + Math.floor(rand() * 340)
        : Math.floor(rand() * 12);

    const id = `c_${(1000 + i).toString()}`;
    const hasRec = answered && outcome !== "in_progress";
    calls.push({
      id,
      phoneNumber: germanNumber(),
      contactName: `${first} ${last}`,
      direction: rand() < 0.9 ? "outbound" : "inbound",
      startedAt: todayAt(hour, min).toISOString(),
      durationSec: duration,
      status,
      outcome,
      agent: "Kalmaz (KI)",
      recordingUrl: hasRec ? `/recordings/${id}.mp3` : null,
      transcriptPreview: answered
        ? pick([
            "Guten Tag, mein Name ist Kalmaz vom Verbund der Privat...",
            "Ah, Sie sind bereits privat versichert - schön...",
            "Kein Problem, dann melde ich mich zu einem besseren Zeitpunkt...",
            "Dürfte ich Ihnen zwei, drei kurze Fragen stellen?",
          ])
        : undefined,
      notes:
        outcome === "converted"
          ? "Termin mit Experten vereinbart, E-Mail erhalten."
          : outcome === "callback"
          ? "Rückruf gewünscht."
          : undefined,
    });
  }
  return calls.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export const calls: Call[] = buildCalls();

export const callbacks: Callback[] = calls
  .filter((c) => c.outcome === "callback")
  .map((c, i) => {
    const d = new Date();
    d.setHours(9 + ((i * 2) % 9), (i * 17) % 60, 0, 0);
    if (i % 3 === 0) d.setDate(d.getDate() + 1);
    return {
      id: `cb_${i}`,
      callId: c.id,
      phoneNumber: c.phoneNumber,
      contactName: c.contactName,
      scheduledAt: d.toISOString(),
      reason: pick([
        "Kunde hatte keine Zeit",
        "Rückruf gewünscht",
        "Entscheidung mit Partner besprechen",
        "Bessere Erreichbarkeit morgen",
      ]),
      priority: pick(["high", "medium", "medium", "low"]),
    };
  });

export const recordings: Recording[] = calls
  .filter((c) => c.recordingUrl)
  .slice(0, 30)
  .map((c) => ({
    id: `rec_${c.id}`,
    callId: c.id,
    phoneNumber: c.phoneNumber,
    contactName: c.contactName,
    createdAt: c.startedAt,
    durationSec: c.durationSec,
    url: c.recordingUrl as string,
    sizeKb: Math.round((c.durationSec * 16) / 8) + 24,
  }));

const LOG_TEMPLATES: { level: LogEntry["level"]; source: string; msg: (c: Call) => string }[] = [
  { level: "info", source: "dialer", msg: (c) => `Wähle ${c.phoneNumber} (${c.contactName})` },
  { level: "success", source: "call", msg: (c) => `Verbunden mit ${c.contactName}` },
  { level: "success", source: "crm", msg: (c) => `${c.contactName} als KONVERTIERT markiert` },
  { level: "warn", source: "call", msg: (c) => `Keine Antwort von ${c.phoneNumber}` },
  { level: "info", source: "recorder", msg: (c) => `Aufnahme gespeichert (${c.durationSec}s)` },
  { level: "error", source: "sip", msg: (c) => `Zeitüberschreitung bei ${c.phoneNumber}` },
];

export const logs: LogEntry[] = calls
  .slice(0, 40)
  .flatMap((c, i) => {
    const t = LOG_TEMPLATES[i % LOG_TEMPLATES.length];
    return [
      {
        id: `log_${i}`,
        ts: c.startedAt,
        level: t.level,
        source: t.source,
        message: t.msg(c),
      },
    ];
  })
  .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

export function computeStats(): Stats {
  const answered = calls.filter((c) => c.status === "answered").length;
  const missed = calls.filter(
    (c) => c.status === "missed" || c.status === "no_answer",
  ).length;
  const conversions = calls.filter((c) => c.outcome === "converted").length;
  const callbacksPending = callbacks.length;
  const activeNow = calls.filter((c) => c.outcome === "in_progress").length;
  const talk = calls.reduce((s, c) => s + c.durationSec, 0);
  const answeredCalls = calls.filter((c) => c.status === "answered");
  const avg = answeredCalls.length
    ? Math.round(talk / answeredCalls.length)
    : 0;

  const hourly: Stats["hourly"] = [];
  for (let h = 8; h <= 18; h++) {
    const inHour = calls.filter(
      (c) => new Date(c.startedAt).getHours() === h,
    );
    hourly.push({
      hour: `${h.toString().padStart(2, "0")}:00`,
      calls: inHour.length,
      conversions: inHour.filter((c) => c.outcome === "converted").length,
    });
  }

  return {
    totalToday: calls.length,
    activeNow,
    answered,
    missed,
    callbacksPending,
    conversions,
    conversionRate: calls.length
      ? Math.round((conversions / calls.length) * 1000) / 10
      : 0,
    avgDurationSec: avg,
    totalTalkTimeSec: talk,
    hourly,
  };
}
