import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EditionCard } from "@/components/edition-card";
import { dbConfigured, listOpenEditions } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Edições | Superteam Certify",
};

export default async function EditionsPage() {
  if (!dbConfigured) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Alert>
          <AlertTitle>Supabase não configurado</AlertTitle>
          <AlertDescription>
            As edições ainda não podem ser carregadas. Configure o Supabase e
            recarregue esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const editions = await listOpenEditions();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Edições</h1>
        <p className="mt-2 text-muted-foreground">
          Escolha a edição do seu curso ou evento para solicitar seu
          certificado.
        </p>
      </div>

      {editions.length === 0 ? (
        <Alert>
          <AlertTitle>Nenhuma edição aberta no momento</AlertTitle>
          <AlertDescription>
            Volte em breve — novas edições aparecem aqui assim que forem
            abertas.
          </AlertDescription>
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
