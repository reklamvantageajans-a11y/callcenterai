export type CallStatus =
  | "answered"
  | "missed"
  | "busy"
  | "no_answer"
  | "voicemail";

export type CallOutcome =
  | "converted"
  | "callback"
  | "not_interested"
  | "no_answer"
  | "in_progress";

export type CallDirection = "outbound" | "inbound";

export interface TranscriptTurn {
  role: "agent" | "user";
  text: string;
  ts: string;
}

export interface Call {
  id: string;
  phoneNumber: string;
  contactName: string;
  direction: CallDirection;
  startedAt: string; // ISO
  durationSec: number;
  status: CallStatus;
  outcome: CallOutcome;
  agent: string;
  recordingUrl: string | null;
  twilioRecordingUrl?: string | null;
  transcriptPreview?: string;
  transcript?: TranscriptTurn[];
  notes?: string;
  lang?: string;
}

export interface Callback {
  id: string;
  callId: string;
  phoneNumber: string;
  contactName: string;
  scheduledAt: string; // ISO
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface Recording {
  id: string;
  callId: string;
  phoneNumber: string;
  contactName: string;
  createdAt: string;
  durationSec: number;
  url: string;
  sizeKb: number;
}

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: string;
  ts: string; // ISO
  level: LogLevel;
  source: string;
  message: string;
}

export interface Stats {
  totalToday: number;
  activeNow: number;
  answered: number;
  missed: number;
  callbacksPending: number;
  conversions: number;
  conversionRate: number; // %
  avgDurationSec: number;
  totalTalkTimeSec: number;
  hourly: { hour: string; calls: number; conversions: number }[];
}
