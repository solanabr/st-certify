import { z } from "zod";
import {
  editionMetaSchema,
  editionSignerFormSchema,
  walletAddressSchema,
} from "@/lib/schemas";
import { layoutSchema } from "@/lib/render/layout";

/**
 * Request schemas for the draft-first wizard (`/api/studio/drafts/**`).
 *
 * Separate from `editionWizardSchema`, which validates a COMPLETE edition at
 * the moment of the chain write. A draft is incomplete by definition — the
 * wizard autosaves after every keystroke on step 1, long before a slug or a
 * signer exists — so every field here is optional and the strict schema runs
 * once, at create-onchain time, against the assembled result.
 */
export const draftMetaSchema = editionMetaSchema.partial();

export const draftCreateSchema = z.object({
  meta: draftMetaSchema.optional(),
});

/**
 * A layout-only autosave must not clobber metadata and vice versa, so both
 * keys are optional and the accessor writes only what it receives.
 *
 * `layout: null` is meaningful, not absence: it is how the wizard records
 * "back to the default template" after the designer had produced one. The
 * template path is derived from this field rather than stored separately —
 * a draft with a layout is on the custom path, one without is on the default
 * path — so the two can never contradict each other.
 */
export const draftPatchSchema = z.object({
  meta: draftMetaSchema.optional(),
  layout: layoutSchema.nullable().optional(),
});

const seatNameRole = editionSignerFormSchema.pick({ name: true, role: true });

/**
 * One seat on step 2. Email is how the invite reaches a human; `wallet` is the
 * advanced escape hatch ("inserir carteira manualmente"), which binds the seat
 * immediately and sends nothing. Exactly one of the two must be usable, which
 * is what the refinement below enforces.
 */
export const seatInputSchema = seatNameRole
  .extend({
    email: z.union([z.email("E-mail inválido."), z.literal("")]).default(""),
    wallet: walletAddressSchema.optional(),
  })
  .superRefine((seat, ctx) => {
    if (!seat.wallet && seat.email === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um e-mail para convidar ou uma carteira.",
        path: ["email"],
      });
    }
  });

export const seatsCreateSchema = z.object({
  seats: z
    .array(seatInputSchema)
    .min(1, "Adicione pelo menos um signatário.")
    .max(6, "No máximo 6 signatários."),
});

export type DraftMetaInput = z.infer<typeof draftMetaSchema>;
export type DraftPatchInput = z.infer<typeof draftPatchSchema>;
export type SeatInput = z.infer<typeof seatInputSchema>;
