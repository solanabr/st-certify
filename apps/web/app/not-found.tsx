import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("system.notFound.title")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("system.notFound.body")}
      </p>
      <Button asChild>
        <Link href="/">{t("system.notFound.home")}</Link>
      </Button>
    </div>
  );
}
