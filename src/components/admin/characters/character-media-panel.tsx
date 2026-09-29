"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CharacterImageSlot } from "@/components/admin/characters/character-image-slot";

interface CharacterMedia {
  id: string;
  name: string;
  avatar_url: string | null;
  image_url: string | null;
  featured_image_url: string | null;
  intro_video_url: string | null;
  gallery_image_urls: string[] | null;
  gallery_video_urls: string[] | null;
  private_gallery_image_urls: string[] | null;
  private_gallery_video_urls: string[] | null;
}

/**
 * Everything an admin needs to replace a character's imagery in one
 * place — this is the actual "change portrait" control that was missing:
 * the upload API (POST/DELETE /api/admin/characters/[id]/media) and its
 * GET read were already fully built, there was simply no UI calling
 * either one. Loads fresh on every characterId change rather than being
 * handed data as a prop, since the master list (character-search-list.tsx)
 * intentionally only fetches the thin list shape, not full media.
 */
export function CharacterMediaPanel({ characterId }: { characterId: string }) {
  const [media, setMedia] = useState<CharacterMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/characters/${characterId}/media`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load media.");
        if (!cancelled) setMedia(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load media.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !media) {
    return <p className="text-sm text-danger py-12 text-center">{error ?? "Character not found."}</p>;
  }

  return (
    <div className="space-y-8">
      <h3 className="font-display text-xl">{media.name}</h3>

      {/* Single-URL fields: avatar (round, used in lists/chat), image
          (the main portrait — swipe cards, character page hero), featured
          (used on the Home/Discover hero placements). A new upload
          replaces the value in place. */}
      <div className="flex flex-wrap gap-6">
        <CharacterImageSlot
          characterId={characterId}
          field="avatar"
          label="Avatar"
          shape="round"
          currentUrl={media.avatar_url}
          onUploaded={(url) => setMedia((m) => (m ? { ...m, avatar_url: url } : m))}
        />
        <div className="w-40">
          <CharacterImageSlot
            characterId={characterId}
            field="image"
            label="Main portrait"
            shape="square"
            currentUrl={media.image_url}
            onUploaded={(url) => setMedia((m) => (m ? { ...m, image_url: url } : m))}
          />
        </div>
        <div className="w-40">
          <CharacterImageSlot
            characterId={characterId}
            field="featured"
            label="Featured image"
            shape="square"
            currentUrl={media.featured_image_url}
            onUploaded={(url) => setMedia((m) => (m ? { ...m, featured_image_url: url } : m))}
          />
        </div>
        <div className="w-40">
          <CharacterImageSlot
            characterId={characterId}
            field="intro_video"
            label="Intro video"
            shape="wide"
            kind="video"
            currentUrl={media.intro_video_url}
            onUploaded={(url) => setMedia((m) => (m ? { ...m, intro_video_url: url } : m))}
          />
        </div>
      </div>

      <GallerySection
        title="Gallery (public)"
        characterId={characterId}
        field="gallery_image"
        kind="image"
        urls={media.gallery_image_urls}
        onChange={(urls) => setMedia((m) => (m ? { ...m, gallery_image_urls: urls } : m))}
      />
      <GallerySection
        title="Gallery videos (public)"
        characterId={characterId}
        field="gallery_video"
        kind="video"
        urls={media.gallery_video_urls}
        onChange={(urls) => setMedia((m) => (m ? { ...m, gallery_video_urls: urls } : m))}
      />
      <GallerySection
        title="Private gallery (admin-only, never shown publicly)"
        characterId={characterId}
        field="private_gallery_image"
        kind="image"
        urls={media.private_gallery_image_urls}
        onChange={(urls) => setMedia((m) => (m ? { ...m, private_gallery_image_urls: urls } : m))}
      />
      <GallerySection
        title="Private gallery videos (admin-only)"
        characterId={characterId}
        field="private_gallery_video"
        kind="video"
        urls={media.private_gallery_video_urls}
        onChange={(urls) => setMedia((m) => (m ? { ...m, private_gallery_video_urls: urls } : m))}
      />
    </div>
  );
}

function GallerySection({
  title,
  characterId,
  field,
  kind,
  urls,
  onChange,
}: {
  title: string;
  characterId: string;
  field: string;
  kind: "image" | "video";
  urls: string[] | null;
  onChange: (urls: string[]) => void;
}) {
  const list = urls ?? [];
  return (
    <Card interactive={false} className="p-4 space-y-3">
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <div className="flex flex-wrap gap-4">
        {list.map((url, i) => (
          <div key={url} className="w-32">
            <CharacterImageSlot
              characterId={characterId}
              field={field}
              label={`#${i + 1}`}
              shape={kind === "video" ? "wide" : "square"}
              kind={kind}
              currentUrl={url}
              disableUpload
              onUploaded={() => {}}
              onRemoved={() => onChange(list.filter((u) => u !== url))}
            />
          </div>
        ))}
        <AddTile
          characterId={characterId}
          field={field}
          kind={kind}
          onAdded={(url) => onChange([...list, url])}
        />
      </div>
    </Card>
  );
}

function AddTile({
  characterId,
  field,
  kind,
  onAdded,
}: {
  characterId: string;
  field: string;
  kind: "image" | "video";
  onAdded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
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
      onAdded(body.url);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className={`w-32 aspect-square rounded-sm border border-dashed border-border-hairline flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-gold-500/60 text-text-tertiary hover:text-gold-400 transition-colors ${
        busy ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
      <span className="text-xs">Add {kind}</span>
      {error && <span className="text-xs text-danger px-2 text-center">{error}</span>}
      <input
        type="file"
        accept={kind === "video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,image/gif"}
        onChange={handleFile}
        className="hidden"
      />
    </label>
  );
}
