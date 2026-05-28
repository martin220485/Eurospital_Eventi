"use client";

import { useEffect, useState } from "react";
import { Stepper } from "@/components/stepper";
import { Card, CardContent } from "@/components/ui/card";
import { setupApi } from "@/lib/setup-api";
import { Welcome } from "./steps/01-welcome";
import { DbConfig } from "./steps/02-db-config";
import { DbTest } from "./steps/03-db-test";
import { Schema } from "./steps/04-schema";
import { AdminStep } from "./steps/05-admin";
import { SmtpStep } from "./steps/06-smtp";
import { AdStep } from "./steps/07-ad";
import { PlatformStep } from "./steps/08-platform";
import { Summary } from "./steps/09-summary";
import { Done } from "./steps/10-done";

const LABELS = [
  "Benvenuto", "MySQL", "Test DB", "Schema", "Admin",
  "SMTP", "AD/SSO", "Piattaforma", "Riepilogo", "Fine",
];

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");

  useEffect(() => {
    setupApi.status().then((s) => setStep(Math.min(s.current_step, 9))).catch(() => {});
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, 9));
  const props = { token, next };

  const screens = [
    <Welcome key="w" token={token} setToken={setToken} next={next} />,
    <DbConfig key="db" {...props} />,
    <DbTest key="t" {...props} />,
    <Schema key="s" {...props} />,
    <AdminStep key="a" {...props} />,
    <SmtpStep key="smtp" {...props} />,
    <AdStep key="ad" {...props} />,
    <PlatformStep key="p" {...props} />,
    <Summary key="sum" {...props} />,
    <Done key="d" {...props} />,
  ];

  return (
    <div className="space-y-6">
      <h1>Configurazione iniziale</h1>
      <Stepper steps={LABELS} current={step} />
      <Card>
        <CardContent className="p-6">{screens[step]}</CardContent>
      </Card>
    </div>
  );
}
