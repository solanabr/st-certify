import type { Metadata } from "next";
import { cache } from "react";
import { InviteCard } from "@/components/invite/invite-card";
import { getInviteByToken } from "@/lib/db/draft-queries";
import { configuredIssuer } from "@/lib/issuer";
import { toInviteView } from "@/lib/invite/view";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Deduped per request (React cache) so generateMetadata and the page body
// share a single DB read, same as app/attend/[token]/page.tsx.
const getInvite = cache((token: string) => getInviteByToken(token));

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  // An invite link is a bearer capability sent to one person — never index it,
  // and never put the edition or signer name in metadata a crawler could keep.
  return {
    title: t("invite.meta.title"),
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvite(token);

  return (
    <main className="mx-auto flex max-w-xl flex-col px-4 py-12">
      <InviteCard
        token={token}
        initialInvite={
          invite ? toInviteView(invite, invite.draft, configuredIssuer()) : null
        }
      />
    </main>
  );
}
