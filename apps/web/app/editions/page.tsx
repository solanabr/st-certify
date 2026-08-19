import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EditionCard } from "@/components/edition-card";
import { dbConfigured, listOpenEditions } from "@/lib/db/queries";
import { getT } from "@/lib/i18n/server";

// The open-editions grid is live data — rendering at request time (like
// /verify/[id]) also keeps `next build` from depending on a reachable DB.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("editions.metaTitle") };
}

export default async function EditionsPage() {
  const { t } = await getT();

  if (!dbConfigured) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Alert>
          <AlertTitle>{t("editions.dbUnconfiguredTitle")}</AlertTitle>
          <AlertDescription>
            {t("editions.dbUnconfiguredDesc")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const editions = await listOpenEditions();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("editions.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("editions.subtitle")}</p>
      </div>

      {editions.length === 0 ? (
        <Alert>
          <AlertTitle>{t("editions.emptyTitle")}</AlertTitle>
          <AlertDescription>{t("editions.emptyDesc")}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {editions.map((edition) => (
            <EditionCard key={edition.address} edition={edition} />
          ))}
        </div>
      )}
    </div>
  );
}
