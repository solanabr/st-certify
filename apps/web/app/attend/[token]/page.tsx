import { ClaimCard } from "@/components/attendance/claim-card";

export const dynamic = "force-dynamic";

export default async function AttendPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <ClaimCard token={token} />
    </main>
  );
}
