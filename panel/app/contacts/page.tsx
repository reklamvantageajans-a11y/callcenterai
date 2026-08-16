"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, BACKEND } from "@/lib/backend";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Contact = { id: string; phone: string; name?: string; lang?: string; createdAt?: string };

export default function ContactsPage() {
  const { t, tick } = useI18n();
  void tick;
  const router = useRouter();
  const [text, setText] = useState("");
  const [lang, setLang] = useState("de");
  const [list, setList] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch(`${BACKEND}/api/contacts`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setList(d.contacts || []))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return list.filter(
      (c) => !s || c.phone.toLowerCase().includes(s) || (c.name || "").toLowerCase().includes(s)
    );
  }, [list, q]);

  const add = async () => {
    setMsg("");
    const r = await fetch(`${BACKEND}/api/contacts`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    const d = await r.json();
    if (!r.ok) setMsg(d.error || "—");
    else {
      setMsg(`+${d.added}${d.skipped ? ` · ${d.skipped}` : ""}${d.invalid ? ` · ${d.invalid}` : ""}`);
      setText("");
      load();
    }
  };

  const startCamp = async () => {
    const phones = Object.keys(sel).filter((k) => sel[k]);
    const nums = phones.length ? phones : list.map((c) => c.phone);
    if (!nums.length) return;
    await fetch(`${BACKEND}/api/campaigns`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "List", lang, concurrency: 2, text: nums.join("\n") }),
    });
    router.push("/campaigns");
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-sm font-semibold">{t("bulkAdd")}</h2>
        <p className="mt-1 text-xs text-muted">{t("bulkHint")}</p>
        <textarea
          className="mt-3 w-full rounded-lg border border-border bg-surface2 px-3 py-2 font-mono text-sm"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"+49 176 …\nAhmet +90 555 …"}
        />
        <label className="mt-2 block text-xs text-muted">
          {t("file")}
          <input
            type="file"
            accept=".csv,.txt,.tsv"
            className="mt-1 block text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setText((prev) => (prev ? prev + "\n" : "") + String(r.result || ""));
              r.readAsText(f);
            }}
          />
        </label>
        <div className="mt-3 flex gap-2">
          <select
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="de">Deutsch</option>
            <option value="tr">Türkçe</option>
          </select>
          <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            {t("addList")}
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-subtle">{msg}</p>}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {t("leads")} · {rows.length}/{list.length}
          </h2>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
              onClick={() => {
                const all = rows.every((c) => sel[c.phone]);
                const next: Record<string, boolean> = {};
                if (!all) rows.forEach((c) => (next[c.phone] = true));
                setSel(next);
              }}
            >
              {t("selectAll")}
            </button>
            <button
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
              onClick={startCamp}
            >
              {t("dialList")}
            </button>
            <button
              className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger"
              onClick={async () => {
                await fetch(`${BACKEND}/api/contacts`, { method: "DELETE", headers: authHeaders() });
                setSel({});
                load();
              }}
            >
              {t("clearList")}
            </button>
          </div>
        </div>
        <input
          className="mb-3 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3" />
                <th className="pb-2 pr-3">{t("name")}</th>
                <th className="pb-2 pr-3">{t("number")}</th>
                <th className="pb-2 pr-3">{t("callLang")}</th>
                <th className="pb-2">{t("time")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={!!sel[c.phone]}
                      onChange={(e) => setSel((p) => ({ ...p, [c.phone]: e.target.checked }))}
                    />
                  </td>
                  <td className="py-2 pr-3">{c.name && c.name !== c.phone ? c.name : "—"}</td>
                  <td className="num py-2 pr-3 font-medium">{c.phone}</td>
                  <td className="py-2 pr-3">{(c.lang || "").toUpperCase()}</td>
                  <td className="flex items-center justify-between py-2 text-subtle">
                    <span>{c.createdAt ? fmtDateTime(c.createdAt) : "—"}</span>
                    <button
                      className="ml-3 text-muted"
                      onClick={async () => {
                        await fetch(`${BACKEND}/api/contacts/${c.id}`, {
                          method: "DELETE",
                          headers: authHeaders(),
                        });
                        load();
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
