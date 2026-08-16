"use client";

import { useEffect, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";

type Camp = {
  id: string;
  name: string;
  lang: string;
  status: string;
  done: number;
  total: number;
  failed?: number;
  numbers?: { phone: string; status: string; error?: string }[];
};

export default function CampaignsPage() {
  const [list, setList] = useState<Camp[]>([]);
  const [text, setText] = useState("");
  const [lang, setLang] = useState("de");
  const [name, setName] = useState("Kampagne");
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch(`${BACKEND}/api/campaigns`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setList(d.campaigns || []))
      .catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setMsg("");
    const r = await fetch(`${BACKEND}/api/campaigns`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, lang, concurrency: 2, text }),
    });
    const d = await r.json();
    if (!r.ok) setMsg(d.error || "Fehler");
    else {
      setMsg(`${d.total} Nummern in der Warteschlange`);
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-sm font-semibold">Sammelwahl — eine Twilio-Nummer, viele Ziele</h2>
        <p className="mt-1 text-xs text-muted">
          Eine Nummer pro Zeile. Render: max. 2 parallel. Telefone klingeln über Twilio.
        </p>
        <input
          className="mt-4 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="mt-3 w-full rounded-lg border border-border bg-surface2 px-3 py-2 font-mono text-sm"
          rows={8}
          placeholder={"+4917...\n+905..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="de">Deutsch</option>
            <option value="tr">Türkçe</option>
          </select>
          <button
            onClick={start}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Kampagne starten
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-subtle">{msg}</p>}
      </div>
      {list.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{c.name}</span>
            <span className="text-muted">
              {c.status} · {c.done}/{c.total} · {c.lang}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full bg-brand"
              style={{ width: `${c.total ? Math.round((100 * (c.done || 0)) / c.total) : 0}%` }}
            />
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-subtle">
            {(c.numbers || []).slice(0, 50).map((n) => (
              <div key={n.phone}>
                {n.phone} — {n.status}
                {n.error ? ` (${n.error})` : ""}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
