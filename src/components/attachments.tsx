import { useEffect, useState } from "react";
import { FileText, ExternalLink, Loader2, Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { getAttachmentUrl, uploadAttachment } from "@/lib/storage";

const ACCEPTED = "image/*,application/pdf";

export const AttachmentUpload = ({
  folder,
  label = "Adjuntar archivo",
  onUploaded,
  disabled,
}: {
  folder: string;
  label?: string;
  onUploaded: (path: string) => void;
  disabled?: boolean;
}) => {
  const [uploading, setUploading] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadAttachment(file, folder);
      onUploaded(path);
      toast({ title: "Archivo adjuntado", description: file.name });
    } catch (error) {
      toast({
        title: "No se pudo adjuntar el archivo",
        description: error instanceof Error ? error.message : "Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" asChild disabled={disabled || uploading}>
      <label className="cursor-pointer">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? "Subiendo..." : label}
        <input
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleChange}
          disabled={disabled || uploading}
        />
      </label>
    </Button>
  );
};

export const AttachmentLink = ({ path, label }: { path: string; label?: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const isPdf = path.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    let active = true;
    void getAttachmentUrl(path).then((signed) => {
      if (!active) return;
      if (signed) setUrl(signed);
      else setError(true);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        Sin acceso al adjunto
      </span>
    );
  }

  const fileName = path.split("/").pop() ?? "adjunto";

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-card px-2 py-1 text-xs text-primary transition-colors hover:bg-accent"
      aria-disabled={!url}
    >
      {isPdf ? <FileText className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{label ?? fileName}</span>
      {url ? <ExternalLink className="h-3 w-3 shrink-0" /> : <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
    </a>
  );
};

export const AttachmentList = ({ paths, emptyLabel }: { paths: string[]; emptyLabel?: string }) => {
  if (paths.length === 0) {
    return emptyLabel ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((path) => (
        <AttachmentLink key={path} path={path} />
      ))}
    </div>
  );
};

/**
 * Carga de varios adjuntos (fotos, presupuestos, fichas técnicas) con la
 * posibilidad de quitar los ya cargados.
 */
export const AttachmentManager = ({
  folder,
  paths,
  onChange,
  disabled,
  label = "Adjuntar archivo",
}: {
  folder: string;
  paths: string[];
  onChange: (paths: string[]) => void;
  disabled?: boolean;
  label?: string;
}) => (
  <div className="space-y-2">
    <AttachmentUpload
      folder={folder}
      label={label}
      onUploaded={(path) => onChange([...paths, path])}
      disabled={disabled}
    />
    {paths.length === 0 ? (
      <p className="text-xs text-muted-foreground">
        Podés adjuntar fotos, presupuestos o fichas técnicas (imágenes o PDF, hasta 10 MB cada uno).
      </p>
    ) : (
      <ul className="space-y-2">
        {paths.map((path) => (
          <li key={path} className="flex flex-wrap items-center gap-2">
            <AttachmentLink path={path} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(paths.filter((entry) => entry !== path))}
            >
              <X className="h-4 w-4" />
              Quitar
            </Button>
          </li>
        ))}
      </ul>
    )}
  </div>
);
