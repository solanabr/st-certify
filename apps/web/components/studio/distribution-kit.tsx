"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import type { StudioEditionView } from "@/components/studio/use-studio-edition";

function truncateMiddle(value: string, head = 28, tail = 12): string {
  return value.length <= head + tail + 1
    ? value
    : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Filename-safe edition name for the downloaded QR. */
function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "qr"
  );
}

/**
 * Same lazy-`qrcode` approach as the events dashboard: the ~50KB encoder is
 * imported the first time the dialog opens, never in the page's initial
 * bundle. Rendered large and on a white plate so a phone camera reads it off
 * a projector or a printed sheet.
 */
function QrDialog({ url, editionName }: { url: string; editionName: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) return;
    setDataUrl(null);
    setFailed(false);
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        setDataUrl(await QRCode.toDataURL(url, { width: 1024, margin: 1 }));
      } catch {
        setFailed(true);
      }
    })();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t("admin.manage.share.qr")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editionName}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center py-2">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI QR code, not a local/Next-optimizable asset
            <img
              src={dataUrl}
              alt={`${t("admin.manage.share.qr")} — ${editionName}`}
              className="size-64 rounded-md bg-white p-3"
            />
          ) : failed ? (
            <p className="text-sm text-muted-foreground">
              {t("system.error.title")}
            </p>
          ) : (
            <Skeleton className="size-64" />
          )}
        </div>
        <p
          className="text-center text-xs break-all text-muted-foreground"
          title={url}
        >
          {truncateMiddle(url)}
        </p>
        {/*
          Downloads the PNG rather than calling window.print(): printing from
          here would send the whole page behind the dialog to the printer, and
          suppressing that needs print rules on the app shell this component
          does not own. A file the issuer prints from their own viewer reaches
          the same "QR to print" outcome without that coupling.
        */}
        <Button
          variant="outline"
          asChild={dataUrl !== null}
          disabled={!dataUrl}
        >
          {dataUrl ? (
            <a href={dataUrl} download={`qr-${slugify(editionName)}.png`}>
              {t("admin.manage.share.downloadQr")}
            </a>
          ) : (
            <span>{t("admin.manage.share.downloadQr")}</span>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Everything an issuer needs to put an edition in front of its students: the
 * public link, a QR to print, a WhatsApp share, and a ready-to-paste block.
 *
 * The absolute URL is built in an effect rather than at render because
 * `window.location.origin` does not exist during the server pass, and this
 * component is inside the client tree of a page that also server-renders.
 */
export function DistributionKit({ edition }: { edition: StudioEditionView }) {
  const { t } = useT();
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const publicUrl =
    origin && edition.publicPath ? `${origin}${edition.publicPath}` : null;

  const shareMessage = publicUrl
    ? t("admin.manage.share.message", {
        name: edition.name,
        url: publicUrl,
      })
    : "";

  async function copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("claim.copied"));
    } catch {
      // Denied clipboard permission and insecure origins both land here —
      // surface the text so it can still be copied by hand.
      toast.error(t("admin.copyLinkFailed"), { description: value });
    }
  }

  return (
    <section aria-labelledby="studio-share-heading">
      <h2
        id="studio-share-heading"
        className="flex items-center gap-2.5 text-lg font-semibold"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-brand-yellow/20 text-primary ring-1 ring-inset ring-primary/20">
          <Share2 className="size-5" aria-hidden="true" />
        </span>
        {t("admin.manage.share.title")}
      </h2>

      {!edition.publicPath ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.manage.share.unavailable")}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.manage.share.intro")}
          </p>

          <div className="elevate mt-4 flex flex-col gap-2 rounded-xl bg-card p-3 sm:flex-row sm:items-center">
            <code
              className="flex-1 truncate text-xs"
              title={publicUrl ?? undefined}
            >
              {publicUrl ?? t("common.loading")}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!publicUrl}
                onClick={() => void copy(publicUrl ?? "")}
              >
                {t("admin.copyLink")}
              </Button>
              {/*
                Both of these need the absolute URL, which only exists after
                the origin effect runs. Gating on `publicUrl` rather than
                disabling keeps us from rendering an anchor that looks
                clickable but carries an empty share text — `disabled` on an
                `asChild` anchor is inert.
              */}
              {publicUrl && (
                <>
                  <QrDialog url={publicUrl} editionName={edition.name} />
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("admin.manage.share.whatsapp")}
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="studio-share-block" className="text-sm font-medium">
              {t("admin.manage.share.copyBlock")}
            </label>
            <Textarea
              id="studio-share-block"
              readOnly
              rows={3}
              value={shareMessage}
              className="mt-2 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!shareMessage}
              onClick={() => void copy(shareMessage)}
            >
              {t("admin.manage.share.copyText")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
