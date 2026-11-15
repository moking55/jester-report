"use client";

import { useState } from "react";

import type { Asset } from "@/lib/workspace";

import styles from "./AssetPreview.module.css";

type Props = { templateId: string; name: string; asset: Asset | undefined; onClose: () => void };

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

/** An image asset over the editor pane; the editor stays mounted underneath with its unsaved edits. */
export function AssetPreview({ templateId, name, asset, onClose }: Props) {
  const [dims, setDims] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const src = `/assets/${templateId}?${new URLSearchParams({ name })}`;
  return (
    <div className={styles.preview} role="region" aria-label={`รูป ${name}`}>
      <div className={styles.title}>
        <code>{name}</code>
        <span className={styles.meta}>
          {[asset?.contentType, asset && size(asset.size), dims].filter(Boolean).join(" · ")}
        </span>
        <span className={styles.spacer} />
        <button type="button" onClick={onClose} aria-label="ปิดรูป กลับไปที่ editor">
          ×
        </button>
      </div>
      <div className={styles.stage}>
        {failed ? (
          <p className={styles.error}>โหลดรูปไม่ได้ ลองเปิดใหม่อีกครั้ง</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a draft asset behind the session; next/image cannot fetch it
          <img
            src={src}
            alt={name}
            onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
