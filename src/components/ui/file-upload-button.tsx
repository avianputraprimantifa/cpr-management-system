import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_BYTES, prepareUploadFile } from "@/lib/image-compress";
import { M } from "@/lib/i18n/messages";
import { isRasterImageFile } from "@/lib/upload-file";

interface Props {
  accept?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
  buttonLabel?: string;
  buttonLabelChange?: string;
  hint?: string;
  className?: string;
  id?: string;
  maxBytes?: number;
  prepareFile?: boolean;
}

function isImageFile(file: File) {
  return isRasterImageFile(file);
}

export function FileUploadButton({
  accept,
  file,
  onChange,
  disabled,
  label,
  buttonLabel = "Pilih File",
  buttonLabelChange = "Ganti File",
  hint,
  className,
  id,
  maxBytes = MAX_UPLOAD_BYTES,
  prepareFile = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const previewUrl = useMemo(() => (
    file && isImageFile(file) ? URL.createObjectURL(file) : null
  ), [file]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function open() {
    if (!compressing) inputRef.current?.click();
  }

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!raw) {
      onChange(null);
      return;
    }

    setCompressing(true);
    try {
      if (!prepareFile) {
        if (raw.size > maxBytes) {
          toast.error(M.fileTooLarge);
          onChange(null);
          return;
        }
        onChange(raw);
        return;
      }

      const { file: prepared, convertedFromHeic, compressed, originalSize } =
        await prepareUploadFile(raw, maxBytes);
      if (convertedFromHeic) toast.info(M.fileHeicConverted);
      if (compressed) {
        toast.info(
          M.fileCompressed(
            (originalSize / (1024 * 1024)).toFixed(1),
            (prepared.size / 1024).toFixed(0),
          ),
        );
      }
      onChange(prepared);
    } catch (err) {
      const code = (err as Error).message;
      if (code === "FILE_TOO_LARGE_NON_IMAGE") toast.error(M.fileTooLarge);
      else if (code === "HEIC_CONVERT_FAILED") toast.error(M.fileHeicConvertFailed);
      else toast.error(M.fileCompressFailed);
      onChange(null);
    } finally {
      setCompressing(false);
    }
  }

  function clear() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = disabled || compressing;

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={handle}
        disabled={busy}
        className="sr-only"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={open} disabled={busy}>
          {compressing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {compressing ? "Mengompres…" : file ? buttonLabelChange : buttonLabel}
        </Button>
        {file && !compressing && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs">
            <span className="font-medium max-w-[14rem] truncate" title={file.name}>
              {file.name}
            </span>
            <span className="text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </span>
            <button
              type="button"
              aria-label="Hapus file"
              onClick={clear}
              disabled={busy}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {file && previewUrl && !compressing && (
        <div className="relative inline-block">
          <img
            src={previewUrl}
            alt={`Pratinjau ${file.name}`}
            className="max-h-48 max-w-full rounded-lg border object-contain bg-muted/30"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Pratinjau — pastikan gambar sudah benar.</p>
        </div>
      )}

      {file && !isImageFile(file) && !compressing && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 max-w-xs">
          <FileText className="h-10 w-10 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-xs">
            <p className="font-medium truncate" title={file.name}>{file.name}</p>
            <p className="text-muted-foreground mt-0.5">File non-gambar — tidak ada pratinjau visual.</p>
          </div>
        </div>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {!hint && (
        <p className="text-xs text-muted-foreground">
          JPG, PNG, HEIC (iPhone) didukung. Gambar lebih dari 5MB dikompres otomatis. PDF maks 5MB.
        </p>
      )}
    </div>
  );
}
