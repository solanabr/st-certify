import type { Metadata } from "next";
import { EditionManager } from "@/components/studio/edition-manager";
import { getT } from "@/lib/i18n/server";

// The id resolves against live mirror data (and, for drafts, a row that may
// not exist yet), so there is nothing to prerender — same posture as the rest
// of the DB-backed routes.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("admin.manage.metaTitle") };
}

export default async function StudioEditionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <EditionManager id={id} />
    </div>
  );
}
