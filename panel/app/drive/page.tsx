"use client";

import { useEffect, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";

export default function DrivePage() {
  const [st, setSt] = useState<{ configured?: boolean; message?: string }>({});

  useEffect(() => {
    fetch(`${BACKEND}/api/drive`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setSt)
      .catch(() => setSt({ message: "Backend nicht erreichbar" }));
  }, []);

  return (
    <div className="card max-w-xl space-y-3 p-6">
      <h2 className="text-sm font-semibold">Google Drive</h2>
      <p className="text-sm text-subtle">
        {st.configured
          ? "Verbunden. Neue Aufnahmen werden nach Gesprächsende als MP3 hochgeladen."
          : st.message || "Nicht konfiguriert"}
      </p>
      <div className="rounded-lg bg-surface2 p-3 font-mono text-xs text-muted">
        GOOGLE_DRIVE_FOLDER_ID
        <br />
        GOOGLE_SERVICE_ACCOUNT_JSON
      </div>
      <p className="text-xs text-muted">
        Service-Account-E-Mail im Drive-Ordner als Editor teilen. JSON in Render/VPS Environment.
      </p>
    </div>
  );
}
