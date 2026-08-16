"use client";

import { useEffect, useState } from "react";
import { authHeaders, BACKEND } from "@/lib/backend";
import { useI18n } from "@/lib/i18n";

export default function DrivePage() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ configured?: boolean; message?: string }>({});

  useEffect(() => {
    fetch(`${BACKEND}/api/drive`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setSt)
      .catch(() => setSt({ message: "—" }));
  }, []);

  return (
    <div className="card max-w-xl space-y-3 p-6">
      <h2 className="text-sm font-semibold">Google Drive</h2>
      <p className="text-sm text-subtle">
        {st.configured ? t("driveOn") : st.message || t("driveOff")}
      </p>
    </div>
  );
}
