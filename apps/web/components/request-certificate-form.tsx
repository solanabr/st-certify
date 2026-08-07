"use client";

import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/useMe";
import {
  REQUEST_STAGE_LABEL,
  useRequestCertificate,
} from "@/hooks/useRequestCertificate";
import { onAppError } from "@/lib/on-app-error";
import {
  requestCertificateSchema,
  studentNameSchema,
  type RequestCertificateInput,
} from "@/lib/schemas";

export function RequestCertificateForm({
  editionAddress,
}: {
  editionAddress: string;
}) {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const { data: me, isLoading: meLoading } = useMe();
  const mutation = useRequestCertificate();

  const form = useForm<RequestCertificateInput>({
    resolver: zodResolver(requestCertificateSchema),
    defaultValues: { editionAddress, name: "", consent: false as never },
  });

  const nameValue = form.watch("name");
  const sanitizedPreview = studentNameSchema.safeParse(nameValue || "");

  if (!ready || meLoading) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }

  if (!authenticated || !me?.authenticated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Entre para solicitar seu certificado nesta edição.
          </p>
          <Button onClick={() => login()}>Entrar</Button>
        </CardContent>
      </Card>
    );
  }

  const wallet = me.wallets[0];
  if (!wallet) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Nenhuma carteira encontrada</AlertTitle>
        <AlertDescription>
          Sua conta ainda não tem uma carteira Solana associada. Tente sair e
          entrar novamente.
        </AlertDescription>
      </Alert>
    );
  }

  async function onSubmit(values: RequestCertificateInput): Promise<void> {
    try {
      await mutation.mutateAsync({ ...values, studentWallet: wallet! });
      toast.success("Certificado solicitado com sucesso!");
      router.push("/me");
    } catch (err) {
      onAppError(err, form, { airdropWallet: wallet });
    }
  }

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-6"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seu nome completo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Como você quer que apareça no certificado"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  {sanitizedPreview.success && sanitizedPreview.data && (
                    <FormDescription>
                      Aparecerá como:{" "}
                      <span className="font-medium text-foreground">
                        {sanitizedPreview.data}
                      </span>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="grid gap-1 leading-none">
                    <FormLabel className="font-normal text-muted-foreground">
                      Entendo que meu endereço de carteira e as datas de
                      assinatura ficam registrados publicamente na blockchain,
                      de forma permanente.
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
              className="w-full"
            >
              {mutation.isPending
                ? REQUEST_STAGE_LABEL[mutation.stage]
                : "Solicitar certificado"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
