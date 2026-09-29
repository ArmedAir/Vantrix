"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";
import { SafeImage as Image } from "@/components/ui/safe-image";
import { resolveImageSrc, cn } from "@/lib/utils";

const ALLOWED_IMAGE = "image/jpeg,image/png,image/webp,image/gif";
const ALLOWED_VIDEO = "video/mp4,video/webm,video/quicktime";

/**
 * One image/video slot inside the character media manager: a thumbnail
 * that becomes a hover-camera "change" button, mirroring
 * profile/avatar-upload.tsx's exact interaction (blob preview while
 * uploading, hover-reveal camera icon) rather than inventing a new upload
 * UX for the admin side. Talks directly to POST/DELETE
 * /api/admin/characters/[id]/media — see that route for the field ->
 * column mapping and why single-URL fields replace-in-place while array
 * fields (gallery_image, etc.) render N of these side by side instead.
 */
export function CharacterImageSlot({
  characterId,
  field,
  label,
  currentUrl,
  shape = "square",
  kind = "image",
  disableUpload = false,
  onUploaded,
  onRemoved,
}: {
  characterId: string;
  field: string;
  label: string;
  currentUrl: string | null;
  shape?: "square" | "round" | "wide";
  kind?: "image" | "video";
  // Array fields (galleries) can only ever APPEND server-side — there's
  // no "replace this specific gallery item" endpoint, so an existing
  // gallery tile must not act as an upload trigger (it would silently
  // append a new entry instead of replacing the one clicked, and the new
  // entry wouldn't even appear until the list is refetched). Only the
  // true single-URL fields (avatar/image/featured/intro_video) and the
  // dedicated "Add" tile in character-media-panel.tsx upload.
  disableUpload?: boolean;
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Same reasoning as avatar-upload.tsx: only drop the local blob preview
  // once the parent has actually re-rendered with the new currentUrl, so
  // there's no flash of a broken/stale image between upload finishing and
  // the server data arriving.
  useEffect(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setBusy("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/characters/${characterId}/media?field=${field}`, {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Upload failed.");
        return;
      }
      onUploaded(body.url);
      router.refresh();
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (!currentUrl || !onRemoved) return;
    setError(null);
    setBusy("remove");
    try {
      const res = await fetch(`/api/admin/characters/${characterId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, url: currentUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't remove.");
        return;
      }
      onRemoved();
      router.refresh();
    } catch {
      setError("Couldn't remove. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const shownUrl = previewUrl ?? resolveImageSrc(currentUrl);
  const isVideo = kind === "video";
  const uploading = busy === "upload";

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => !disableUpload && inputRef.current?.click()}
        disabled={busy !== null || disableUpload}
        aria-label={disableUpload ? label : `Change ${label}`}
        className={cn(
          "group relative overflow-hidden border border-border-hairline bg-black/40",
          !disableUpload && "disabled:pointer-events-none",
          disableUpload && "cursor-default",
          shape === "round" && "h-16 w-16 rounded-full",
          shape === "square" && "aspect-square w-full rounded-sm",
          shape === "wide" && "aspect-video w-full rounded-sm",
        )}
      >
        {currentUrl || previewUrl ? (
          isVideo && !previewUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={shownUrl} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <Image
              src={shownUrl}
              alt=""
              fill
              sizes="200px"
              className="object-cover"
              unoptimized={Boolean(previewUrl)}
            />
          )
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-text-tertiary">
            None
          </span>
        )}
        {!disableUpload && (
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity ease-premium",
              uploading && "opacity-100",
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </span>
        )}
      </button>

      {onRemoved && currentUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy !== null}
          className="flex items-center gap-1 text-xs text-danger/80 hover:text-danger disabled:opacity-40"
        >
          {busy === "remove" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          Remove
        </button>
      )}

      <p className="text-xs text-text-tertiary truncate max-w-[200px]">{label}</p>
      {error && <p className="text-xs text-danger">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={isVideo ? ALLOWED_VIDEO : ALLOWED_IMAGE}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
