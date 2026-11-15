"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { Asset, TextFile } from "@/lib/workspace";

import styles from "./FilePanel.module.css";

const REQUIRED = ["report.json", "template.html"]; // the api refuses to delete these
const FILE_NAME = /^(?!index\.html$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$/;
const ASSET = /\.(png|jpe?g|svg|ttf|otf)$/i;
const IMAGE = /\.(png|jpe?g|svg)$/i;
const NAME_RULE = "ชื่อไฟล์ใช้ได้เฉพาะ A–Z a–z 0–9 . _ - และลงท้าย .html .css .json";

type Props = {
  files: TextFile[];
  assets: Asset[];
  active: string;
  dirty: string[];
  busy: boolean;
  onOpen: (name: string) => void;
  onAdd: (name: string, content?: string) => void;
  onDelete: (name: string) => void;
  onUpload: (file: File) => void;
  onDeleteAsset: (name: string) => void;
  previewing: string | null;
  onPreview: (name: string) => void;
};

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

export function FilePanel(props: Props) {
  const { files, assets, active, dirty, busy } = props;
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);
  const taken = (file: string) => files.some((f) => f.name === file);
  const valid = FILE_NAME.test(name) && !taken(name);

  // the menu closes on a click outside it or on Escape, like a native one
  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => !addMenu.current?.contains(e.target as Node) && setMenu(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  function create(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    props.onAdd(name);
    setName("");
    setCreating(false);
  }

  /** Images and fonts become assets; .html .css .json become draft files with their text. */
  async function importFile(file: File) {
    setError(null);
    if (ASSET.test(file.name)) return props.onUpload(file);
    if (!FILE_NAME.test(file.name)) return setError(`นำเข้า ${file.name} ไม่ได้: ${NAME_RULE} หรือเป็นรูป/ฟอนต์`);
    if (taken(file.name)) return setError(`มีไฟล์ ${file.name} อยู่แล้ว ลบหรือเปลี่ยนชื่อไฟล์ที่จะนำเข้าก่อน`);
    props.onAdd(file.name, await file.text());
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

      <div className={styles.addMenu} ref={addMenu}>
        <button
          type="button"
          className={styles.addButton}
          aria-haspopup="menu"
          aria-expanded={menu}
          disabled={busy}
          onClick={() => setMenu((open) => !open)}
        >
          <span aria-hidden="true">+</span> เพิ่มไฟล์
        </button>
        {menu && (
          <div role="menu" className={styles.menu}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setCreating(true);
                setError(null);
              }}
            >
              สร้างไฟล์ใหม่
              <small>.html .css .json ว่าง ๆ</small>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                picker.current?.click();
              }}
            >
              Import ไฟล์…
              <small>.html .css .json, รูป หรือฟอนต์</small>
            </button>
          </div>
        )}
        {/* outside the menu: the menu closes before the file dialog answers */}
        <input
          ref={picker}
          type="file"
          hidden
          accept=".html,.css,.json,.png,.jpg,.jpeg,.svg,.ttf,.otf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>
      {creating && (
        <form onSubmit={create} className={styles.add}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
            placeholder="ไฟล์ใหม่.html"
            aria-label="ชื่อไฟล์ใหม่ (.html .css .json)"
          />
          <button type="submit" disabled={!valid || busy}>
            สร้าง
          </button>
          <button type="button" onClick={() => setCreating(false)} aria-label="ยกเลิก">
            ×
          </button>
        </form>
      )}
      {creating && name && !valid && (
        <p className={styles.error}>{taken(name) ? `มีไฟล์ ${name} อยู่แล้ว` : NAME_RULE}</p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <h3>Assets</h3>
      {assets.length === 0 && <p className={styles.hint}>รูปหรือฟอนต์ที่ template ใช้ นำเข้าผ่าน &quot;+ เพิ่มไฟล์&quot;</p>}
      {assets.map((a) => (
        <div key={a.name} className={styles.row}>
          {IMAGE.test(a.name) ? (
            <button
              type="button"
              className={`${styles.name} ${styles.asset}`}
              title={`ดูรูป · ${a.contentType} · ${size(a.size)}`}
              aria-current={a.name === props.previewing ? "true" : undefined}
              onClick={() => props.onPreview(a.name)}
            >
              {a.name} <small>{size(a.size)}</small>
            </button>
          ) : (
            <span className={styles.asset} title={`${a.contentType} · ${size(a.size)}`}>
              {a.name} <small>{size(a.size)}</small>
            </span>
          )}
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
    </nav>
  );
}
