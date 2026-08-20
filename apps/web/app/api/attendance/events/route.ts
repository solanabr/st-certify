export const maxDuration = 60;

import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { fail } from "@/lib/errors";
import { createEventSchema, IMAGE_DATA_URL_RE } from "@/lib/attendance/schemas";
import { requireAttendanceCreator } from "@/lib/attendance/require-creator";
import { generateClaimToken } from "@/lib/attendance/token";
import { buildAttendanceMetadata } from "@/lib/attendance/metadata";
import {
  storeAttendanceImage,
  storeAttendanceMetadata,
} from "@/lib/attendance/storage";
import { insertEvent } from "@/lib/db/attendance-mutations";
import { listAttendanceEvents } from "@/lib/db/attendance-queries";
import { createEventCollection } from "@/lib/chain/attendance";
import {
  toEventView,
  type AttendanceEventView,
} from "@/lib/attendance/event-view";
import type { AttendanceEventRow } from "@/lib/db/types";

/** Creator dashboard's event list. */
export async function GET(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<AttendanceEventView[]> => {
    await requireAttendanceCreator();
    const origin = new URL(request.url).origin;
    const events = await listAttendanceEvents();
    return events.map((row) => toEventView(row, origin));
  });
}

/**
 * Creates an event: uploads the image, builds + uploads the metadata JSON,
 * mints a per-event Core collection, then persists the mirror row. Image and
 * metadata uploads are content-addressed and idempotent, so a failure there
 * is safe garbage — no cleanup needed. A failure in `insertEvent` after the
 * collection is created leaves an orphan collection on devnet (~0.003 SOL,
 * acceptable) — logged below and rethrown so the caller still sees the real
 * error.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return apiRoute(async (): Promise<AttendanceEventView> => {
    const creatorWallet = await requireAttendanceCreator();

    const body = createEventSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success) {
      fail("VALIDATION", "Dados inválidos.", { detail: body.error.message });
    }
    const {
      name,
      description,
      eventDate,
      endDate,
      location,
      eventUrl,
      imageDataUrl,
      maxSupply,
      claimDeadline,
    } = body.data;

    const match = imageDataUrl.match(IMAGE_DATA_URL_RE);
    if (!match) {
      fail("VALIDATION", "Imagem inválida.", { field: "imageDataUrl" });
    }
    const [, mime, b64] = match;

    const claimToken = generateClaimToken();
    const imageUrl = await storeAttendanceImage(
      Buffer.from(b64, "base64"),
      `image/${mime}` as "image/png" | "image/jpeg" | "image/webp",
    );
    const eventId = randomUUID();
    const metadataUri = await storeAttendanceMetadata(
      buildAttendanceMetadata({
        name,
        description,
        imageUrl,
        imageMime: `image/${mime}`,
        eventDate,
        endDate,
        location: location || undefined,
        eventUrl,
        eventId,
      }),
    );
    const collectionAddress = await createEventCollection({
      name,
      metadataUri,
    });

    let row: AttendanceEventRow;
    try {
      row = await insertEvent({
        id: eventId,
        name,
        description,
        imageUrl,
        metadataUri,
        collectionAddress,
        eventDate,
        endDate: endDate ?? null,
        location,
        eventUrl: eventUrl ?? "",
        maxSupply: maxSupply ?? null,
        claimDeadline: claimDeadline ?? null,
        claimToken,
        createdByWallet: creatorWallet,
      });
    } catch (err) {
      console.error(
        `attendance event insert failed after collection ${collectionAddress} was created (orphan on devnet):`,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }

    return toEventView(row, new URL(request.url).origin);
  });
}
