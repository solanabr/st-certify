"use client";

import { VerifyTool } from "@/components/verify/verify-tool";
import { useT } from "@/lib/i18n";

export default function VerifyPage() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("verify.title")}
      </h1>
      <p className="mt-2 text-muted-foreground">{t("verify.subtitle")}</p>

      <div className="mt-8">
        <VerifyTool />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        {t("verify.tool.threeWays")}
      </p>
    </div>
  );
}
