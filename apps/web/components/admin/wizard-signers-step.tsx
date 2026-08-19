"use client";

import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { EditionWizardInput } from "@/lib/schemas";

interface Props {
  form: UseFormReturn<EditionWizardInput>;
  onNext: () => void;
  onBack: () => void;
}

export function WizardSignersStep({ form, onNext, onBack }: Props) {
  const { t } = useT();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "signers",
  });

  async function handleNext(): Promise<void> {
    const names = fields.flatMap(
      (_, i) =>
        [
          `signers.${i}.wallet`,
          `signers.${i}.name`,
          `signers.${i}.role`,
        ] as const,
    );
    const valid = await form.trigger(names);
    if (valid) {
      onNext();
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("admin.signers.intro")}
      </p>

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <FormField
            control={form.control}
            name={`signers.${index}.wallet`}
            render={({ field: f }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder={t("admin.signers.walletPlaceholder")}
                    {...f}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`signers.${index}.name`}
            render={({ field: f }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder={t("admin.signers.namePlaceholder")}
                    {...f}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`signers.${index}.role`}
            render={({ field: f }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder={t("admin.signers.rolePlaceholder")}
                    {...f}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={fields.length <= 2}
            onClick={() => remove(index)}
            aria-label={t("admin.signers.removeAria", { index: index + 1 })}
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= 6}
        onClick={() => append({ wallet: "", name: "", role: "" })}
      >
        <Plus /> {t("admin.signers.add")}
      </Button>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          {t("admin.back")}
        </Button>
        <Button type="button" onClick={() => void handleNext()}>
          {t("admin.continue")}
        </Button>
      </div>
    </div>
  );
}
