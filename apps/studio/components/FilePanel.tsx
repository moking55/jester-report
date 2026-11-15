"use client";

import { useState, type FormEvent } from "react";

import type { Asset, TextFile } from "@/lib/workspace";

import styles from "./FilePanel.module.css";

const REQUIRED = ["report.json", "template.html"]; // the api refuses to delete these
const FILE_NAME = /^(?!index\.html$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$/;

type Props = {
  files: TextFile[];
  assets: Asset[];
  active: string;
  dirty: string[];
  busy: boolean;
  onOpen: (name: string) => void;
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
  onUpload: (file: File) => void;
  onDeleteAsset: (name: string) => void;
};

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

export function FilePanel(props: Props) {
  const { files, assets, active, dirty, busy } = props;
  const [name, setName] = useState("");
  const valid = FILE_NAME.test(name) && !files.some((f) => f.name === name);

  function add(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    props.onAdd(name);
    setName("");
  }

  return (
    <nav className={styles.panel} aria-label="ไฟล์">
      <h3>ไฟล์</h3>
      {files.map((f) => (
        <div key={f.name} className={styles.row}>
          <button
            type="button"
            className={styles.name}
            aria-current={f.name === active ? "true" : undefined}
            onClick={() => props.onOpen(f.name)}
          >
            {f.name}
            {dirty.includes(f.name) && <span aria-label="ยังไม่บันทึก"> ●</span>}
          </button>
          {!REQUIRED.includes(f.name) && (
            <button
              type="button"
              className={styles.remove}
              aria-label={`ลบ ${f.name}`}
              disabled={busy}
              onClick={() => confirm(`ลบ ${f.name} ออกจาก draft?`) && props.onDelete(f.name)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <form onSubmit={add} className={styles.add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          placeholder="ไฟล์ใหม่.html"
          aria-label="ชื่อไฟล์ใหม่ (.html .css .json)"
        />
        <button type="submit" disabled={!valid || busy}>
          เพิ่ม
        </button>
      </form>

      <h3>Assets</h3>
      {assets.length === 0 && <p className={styles.hint}>รูปหรือฟอนต์ที่ template ใช้</p>}
      {assets.map((a) => (
        <div key={a.name} className={styles.row}>
          <span className={styles.asset} title={`${a.contentType} · ${size(a.size)}`}>
            {a.name} <small>{size(a.size)}</small>
          </span>
          <button
            type="button"
            className={styles.remove}
            aria-label={`ลบ ${a.name}`}
            disabled={busy}
            onClick={() => confirm(`ลบ ${a.name} ออกจาก draft?`) && props.onDeleteAsset(a.name)}
          >
            ×
          </button>
        </div>
      ))}
      <label className={styles.upload}>
        อัปโหลด…
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.svg,.ttf,.otf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) props.onUpload(file);
          }}
        />
      </label>
    </nav>
  );
}
