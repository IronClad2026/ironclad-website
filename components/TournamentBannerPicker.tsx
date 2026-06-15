"use client";

import { ImageIcon, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createTournamentBannerUpload } from "@/app/admin/tournaments/actions";
import { supabase } from "@/lib/supabase";

const acceptedImageTypes = "image/jpeg,image/png,image/webp";

export default function TournamentBannerPicker({
  defaultValue,
  tournamentId,
  readOnly,
}: {
  defaultValue: string;
  tournamentId: string | null;
  readOnly: boolean;
}) {
  const [bannerUrl, setBannerUrl] = useState(defaultValue);
  const [previewUrl, setPreviewUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  const selectBanner = async (file: File | undefined) => {
    if (!file) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(objectUrlRef.current);
    setBannerUrl("");
    setError("");
    setUploading(true);

    try {
      const upload = await createTournamentBannerUpload({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        tournamentId,
      });
      const { error: uploadError } = await supabase.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, file, {
          contentType: file.type,
        });

      if (uploadError) throw uploadError;
      setBannerUrl(upload.publicUrl);
      setPreviewUrl(upload.publicUrl);
    } catch (uploadError) {
      console.error("Tournament banner upload failed:", uploadError);
      setBannerUrl(defaultValue);
      setPreviewUrl(defaultValue);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Banner upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="md:col-span-2">
      <span className="text-sm font-bold">Banner Image</span>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="relative aspect-[16/6] min-h-44 overflow-hidden bg-zinc-950">
          {previewUrl ? (
            <div
              role="img"
              aria-label="Tournament banner preview"
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${previewUrl})` }}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-zinc-600">
              <div className="text-center">
                <ImageIcon className="mx-auto" size={38} />
                <p className="mt-3 text-sm font-bold">Banner preview</p>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <input
            name="bannerImageUrl"
            value={bannerUrl}
            onChange={(event) => {
              setBannerUrl(event.target.value);
              setPreviewUrl(event.target.value);
              setError("");
            }}
            required
            readOnly={readOnly || uploading}
            placeholder="Upload an image or enter an image URL"
            className={`w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-orange-400 ${
              readOnly ? "cursor-default border-white/5 bg-black/20 text-zinc-300" : ""
            }`}
          />

          {!readOnly && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-5 py-3 font-black text-orange-200 transition hover:bg-orange-500/20">
                <Upload size={17} />
                {uploading ? "Uploading Banner..." : "Browse Images"}
                <input
                  type="file"
                  accept={acceptedImageTypes}
                  disabled={uploading}
                  onChange={(event) => {
                    void selectBanner(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              <p className="text-xs leading-5 text-zinc-500">
                JPG, JPEG, PNG, or WEBP. High-resolution artwork up to 100 MB.
              </p>
            </div>
          )}

          {error && <p className="text-sm font-bold text-red-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
