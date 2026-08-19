"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEvent } from "@/hooks/useAttendanceEvents";
import { useT } from "@/lib/i18n";
import {
  createEventSchema,
  type CreateEventInput,
} from "@/lib/attendance/schemas";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// `description` carries a zod `.default("")`, which makes it optional on the
// schema's *input* side (what the form fields hold) but required on its
// *output* side (what `zodResolver` hands `onSubmit` post-parse) — hence the
// two type params: `useForm`'s TFieldValues is the input shape,
// `CreateEventInput` (output) is only what the submit handler receives.
type CreateEventFormValues = z.input<typeof createEventSchema>;

const DEFAULT_VALUES: CreateEventFormValues = {
  name: "",
  description: "",
  eventDate: "",
  imageDataUrl: "",
  maxSupply: undefined,
  claimDeadline: undefined,
};

/**
 * "Novo evento" trigger + dialog-hosted form (Task 14 step 2). Self-contained
 * like `RevokeCell` — owns its own open state, so the dashboard just drops
 * `<EventForm/>` in its header. `useCreateEvent`'s hook already toasts +
 * routes errors through `onAppError` on failure, so the submit handler only
 * has to handle the success path.
 */
export function EventForm() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const createEvent = useCreateEvent();

  const form = useForm<CreateEventFormValues, unknown, CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: DEFAULT_VALUES,
  });

  function resetForm(): void {
    form.reset(DEFAULT_VALUES);
    setDeadlineLocal("");
  }

  async function handleImageChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_BYTES) {
      form.setError("imageDataUrl", { message: t("attendance.form.image") });
      e.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      form.clearErrors("imageDataUrl");
      form.setValue("imageDataUrl", dataUrl, { shouldValidate: true });
    } catch {
      form.setError("imageDataUrl", { message: t("attendance.form.image") });
    }
  }

  async function onSubmit(values: CreateEventInput): Promise<void> {
    try {
      await createEvent.mutateAsync(values);
      toast.success(t("attendance.form.created"));
      resetForm();
      setOpen(false);
    } catch {
      // Already toasted by useCreateEvent's onError.
    }
  }

  const imagePreview = form.watch("imageDataUrl");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>{t("attendance.events.new")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("attendance.events.new")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("attendance.form.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("attendance.form.description")}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("attendance.form.date")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageDataUrl"
              render={() => (
                <FormItem>
                  <FormLabel>{t("attendance.form.image")}</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleImageChange(e)}
                    />
                  </FormControl>
                  {imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URI preview of the just-selected file, not a local/Next-optimizable asset
                    <img
                      src={imagePreview}
                      alt=""
                      aria-hidden="true"
                      className="mt-2 max-h-40 rounded-md border border-border object-contain"
                    />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxSupply"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("attendance.form.maxSupply")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ""
                            ? undefined
                            : e.target.valueAsNumber,
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
              name="claimDeadline"
              render={() => (
                <FormItem>
                  <FormLabel>{t("attendance.form.deadline")}</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={deadlineLocal}
                      onChange={(e) => {
                        setDeadlineLocal(e.target.value);
                        form.setValue(
                          "claimDeadline",
                          e.target.value
                            ? new Date(e.target.value).toISOString()
                            : undefined,
                          { shouldValidate: true },
                        );
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={createEvent.isPending}
              aria-busy={createEvent.isPending}
              className="w-full"
            >
              {createEvent.isPending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {createEvent.isPending
                ? t("attendance.form.creating")
                : t("attendance.form.submit")}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
