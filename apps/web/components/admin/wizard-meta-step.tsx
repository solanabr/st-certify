"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import type { EditionWizardInput } from "@/lib/schemas";

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Props {
  form: UseFormReturn<EditionWizardInput>;
  onNext: () => void;
}

type SlugStatus = "idle" | "checking" | "available" | "taken";

export function WizardMetaStep({ form, onNext }: Props) {
  const { t } = useT();
  const [slugEdited, setSlugEdited] = useState(
    Boolean(form.getValues("meta.slug")),
  );
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");

  async function checkSlug(): Promise<void> {
    const slug = form.getValues("meta.slug");
    if (!slug || slug.length < 3) {
      return;
    }
    setSlugStatus("checking");
    try {
      const res = await api<{ available: boolean }>(
        `/api/admin/editions/slug-available?slug=${encodeURIComponent(slug)}`,
      );
      setSlugStatus(res.available ? "available" : "taken");
      if (!res.available) {
        form.setError("meta.slug", { message: t("admin.meta.slugTaken") });
      }
    } catch {
      setSlugStatus("idle");
    }
  }

  async function handleNext(): Promise<void> {
    const valid = await form.trigger([
      "meta.name",
      "meta.slug",
      "meta.maxSupply",
      "meta.completionDate",
      "meta.description",
    ]);
    if (valid && slugStatus !== "taken") {
      onNext();
    }
  }

  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="meta.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("admin.meta.nameLabel")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("admin.meta.namePlaceholder")}
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  if (!slugEdited) {
                    form.setValue("meta.slug", slugify(e.target.value));
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="meta.slug"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("admin.meta.slugLabel")}</FormLabel>
            <FormControl>
              <Input
                placeholder="solana-bootcamp-2026"
                {...field}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlugStatus("idle");
                  field.onChange(e);
                }}
                onBlur={() => {
                  field.onBlur();
                  void checkSlug();
                }}
              />
            </FormControl>
            <FormDescription>
              {slugStatus === "checking" && t("admin.meta.slugChecking")}
              {slugStatus === "available" && t("admin.meta.slugAvailable")}
              {slugStatus === "idle" && `/editions/${field.value || "..."}`}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="meta.maxSupply"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("admin.meta.maxSupplyLabel")}</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={1}
                placeholder={t("admin.meta.maxSupplyPlaceholder")}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(
                    e.target.value === "" ? undefined : e.target.valueAsNumber,
                  )
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="meta.completionDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("admin.meta.completionDateLabel")}</FormLabel>
            <FormControl>
              <Input type="date" {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="meta.description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("admin.meta.descriptionLabel")}</FormLabel>
            <FormControl>
              <Textarea rows={3} {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex justify-end pt-2">
        <Button type="button" onClick={() => void handleNext()}>
          {t("admin.continue")}
        </Button>
      </div>
    </div>
  );
}
