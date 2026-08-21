import Link from "next/link";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getT } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n";
import type { EditionStatusValue, EditionWithSigners } from "@/lib/db/types";

const STATUS_LABEL_KEY: Record<EditionStatusValue, TranslationKey> = {
  Open: "editions.status.open",
  Paused: "editions.status.paused",
  Closed: "editions.status.closed",
};

const STATUS_VARIANT: Record<
  EditionStatusValue,
  "default" | "secondary" | "outline"
> = {
  Open: "default",
  Paused: "secondary",
  Closed: "outline",
};

export async function EditionCard({
  edition,
}: {
  edition: EditionWithSigners;
}) {
  const { t } = await getT();
  const progressPct =
    edition.maxSupply > 0
      ? Math.min(100, (edition.minted / edition.maxSupply) * 100)
      : 0;

  return (
    <Link
      href={`/certificates/${edition.slug}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="group hover-lift h-full gap-4 overflow-hidden py-0">
        <div
          className="gradient-solana-accent flex aspect-video w-full items-center justify-center text-3xl font-semibold text-background transition-transform duration-300 ease-[var(--ease-spring)] motion-safe:group-hover:scale-105"
          aria-hidden="true"
        >
          {edition.name.charAt(0).toUpperCase()}
        </div>
        <CardContent className="space-y-3 pb-6">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug">{edition.name}</h3>
            <Badge variant={STATUS_VARIANT[edition.status]}>
              {t(STATUS_LABEL_KEY[edition.status])}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Progress value={progressPct} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("editions.mintedShort", {
                minted: edition.minted,
                max: edition.maxSupply,
              })}
            </p>
          </div>

          {edition.signers.length > 0 && (
            <AvatarGroup>
              {edition.signers.slice(0, 4).map((signer) => (
                <Avatar key={signer.wallet} size="sm">
                  <AvatarFallback>
                    {signer.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
