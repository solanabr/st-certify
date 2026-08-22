"use client";

import { useEffect, useState } from "react";
import { FileSignature, Landmark, Lock, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

const CLAUSES: {
  icon: typeof FileSignature;
  title: TranslationKey;
  body: TranslationKey;
}[] = [
  {
    icon: FileSignature,
    title: "sign.consent.attestTitle",
    body: "sign.consent.attestBody",
  },
  {
    icon: Landmark,
    title: "sign.consent.recordTitle",
    body: "sign.consent.recordBody",
  },
  {
    icon: Lock,
    title: "sign.consent.finalTitle",
    body: "sign.consent.finalBody",
  },
  {
    icon: Wallet,
    title: "sign.consent.walletTitle",
    body: "sign.consent.walletBody",
  },
];

/**
 * The disclosure that stands between a signer and their first wallet prompt of
 * the session (spec §6.4). The checkbox is the point: it makes the signer
 * acknowledge that the record is public, permanent and un-withdrawable before
 * any of it happens, rather than after.
 *
 * The acknowledgement resets whenever the dialog reopens, so a signer who
 * closes it mid-read doesn't come back to a pre-ticked box they never read.
 */
export function ConsentPanel({
  open,
  onOpenChange,
  onAgree,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgree: () => void;
}) {
  const { t } = useT();
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) setAcknowledged(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sign.consent.title")}</DialogTitle>
          <DialogDescription>{t("sign.consent.lead")}</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-4">
          {CLAUSES.map((clause) => (
            <li key={clause.title} className="flex items-start gap-3">
              <clause.icon
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">{t(clause.title)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(clause.body)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
            className="mt-0.5"
          />
          <span>{t("sign.consent.agree")}</span>
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("sign.consent.cancel")}
          </Button>
          <Button onClick={onAgree} disabled={!acknowledged}>
            {t("sign.consent.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
