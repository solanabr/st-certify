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
import { useT } from "@/lib/i18n";
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
  const { t } = useT();

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
            {t("student.signInPrompt")}
          </p>
          <Button onClick={() => login()}>{t("nav.signIn")}</Button>
        </CardContent>
      </Card>
    );
  }

  const wallet = me.wallets[0];
  if (!wallet) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("student.noWalletTitle")}</AlertTitle>
        <AlertDescription>{t("student.noWalletDesc")}</AlertDescription>
      </Alert>
    );
  }

  async function onSubmit(values: RequestCertificateInput): Promise<void> {
    try {
      await mutation.mutateAsync({ ...values, studentWallet: wallet! });
      toast.success(t("student.requestSuccess"));
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
                  <FormLabel>{t("student.nameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("student.namePlaceholder")}
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  {sanitizedPreview.success && sanitizedPreview.data && (
                    <FormDescription>
                      {t("student.namePreview")}{" "}
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
                      {t("student.consent")}
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
                ? t(REQUEST_STAGE_LABEL[mutation.stage])
                : t("student.requestCertificate")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
