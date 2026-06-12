import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecoveryEmailPreview } from "@/lib/recovery-email-preview";

export function DevEmailPreview({ preview }: { preview: RecoveryEmailPreview }) {
  return (
    <div className="rounded-lg border bg-background shadow-sm overflow-hidden text-sm">
      <div className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
        Pratinjau kotak masuk (simulasi)
      </div>
      <div className="px-4 py-3 space-y-2 border-b">
        <div className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
          <span className="text-muted-foreground">Dari</span>
          <span>noreply@carlton.supabase.co</span>
          <span className="text-muted-foreground">Kepada</span>
          <span className="font-medium">{preview.to}</span>
          <span className="text-muted-foreground">Subjek</span>
          <span className="font-medium">{preview.subject}</span>
        </div>
      </div>
      <div className="px-4 py-4 space-y-4 whitespace-pre-wrap text-sm leading-relaxed">
        {preview.bodyText}
        <div className="pt-2">
          <Button asChild size="sm">
            <a href={preview.actionLink} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Ubah Password Saya
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground break-all pt-2 border-t">
          Tautan: {preview.actionLink}
        </p>
      </div>
    </div>
  );
}
