"use client";

import { type CSSProperties, useState, useTransition } from "react";
import { useImmer } from "use-immer";

import { deleteTheme, saveTheme, setDefaultTheme, type ThemeResult } from "@/lib/actions/themes";
import { readThemeFile, type Theme, themeFile, themeStyle, type ThemeTokens } from "@/lib/theme";
import type { ValidationProblem } from "@/lib/workspace";

import styles from "./ThemeEditor.module.css";

type ColorKey = Extract<keyof ThemeTokens, `color.${string}`>;
type Draft = { id: string | null; name: string; tokens: ThemeTokens; builtIn: boolean };

const COLORS: [ColorKey, string][] = [
  ["color.background", "พื้นหลัง"],
  ["color.surface", "พื้นผิว (กล่อง, ตาราง)"],
  ["color.surfaceAlt", "พื้นผิวรอง (หัวตาราง)"],
  ["color.border", "เส้นขอบ"],
  ["color.text", "ตัวอักษร"],
  ["color.textMuted", "ตัวอักษรจาง"],
  ["color.primary", "สีหลัก"],
  ["color.onPrimary", "ตัวอักษรบนสีหลัก"],
  ["color.danger", "ผิดพลาด"],
  ["color.warning", "เตือน"],
  ["color.success", "สำเร็จ"],
];
const FONTS: ThemeTokens["font.family"][] = ["TH Sarabun New", "Sarabun", "Noto Sans Thai", "system-ui"];

const fromTheme = (theme: Theme): Draft => ({
  id: theme.id,
  name: theme.name,
  tokens: { ...theme.tokens },
  builtIn: theme.builtIn,
});

export function ThemeEditor({ themes, defaultId }: { themes: Theme[]; defaultId: string }) {
  const [draft, update] = useImmer<Draft>(() => fromTheme(themes.find((t) => t.id === defaultId) ?? themes[0]));
  const [problems, setProblems] = useState<ValidationProblem[]>([]);
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [pending, startTransition] = useTransition();

  const saved = themes.find((t) => t.id === draft.id);
  // key by key: the api's list and its save response order the keys differently (jsonb)
  const dirty =
    !saved ||
    saved.name !== draft.name ||
    (Object.keys(draft.tokens) as (keyof ThemeTokens)[]).some((key) => saved.tokens[key] !== draft.tokens[key]);

  const select = (theme: Theme) => {
    if (dirty && !window.confirm("ทิ้งการแก้ที่ยังไม่บันทึก?")) return;
    update(() => fromTheme(theme));
    setProblems([]);
    setMessage({});
  };

  const settle = (result: ThemeResult, notice: string) => {
    if (result.ok) {
      update(() => fromTheme(result.theme));
      setProblems([]);
      setMessage({ notice });
    } else {
      setProblems(result.problems);
      setMessage({ error: result.error });
    }
  };

  const save = () =>
    startTransition(async () => settle(await saveTheme(draft.id, draft.name, draft.tokens), "บันทึกแล้ว"));

  const remove = () => {
    if (!draft.id || !window.confirm(`ลบ theme "${draft.name}"? ถ้าเป็นค่าเริ่มต้นอยู่ ระบบจะกลับไปใช้ classic`)) return;
    const id = draft.id;
    startTransition(async () => {
      const error = await deleteTheme(id);
      if (error) return setMessage({ error });
      update(() => fromTheme(themes.find((t) => t.id === "classic") ?? themes[0]));
      setMessage({ notice: "ลบแล้ว" });
    });
  };

  const makeDefault = () => {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const error = await setDefaultTheme(id);
      setMessage(error ? { error } : { notice: "ตั้งเป็นค่าเริ่มต้นของระบบแล้ว (หน้า login และคนที่ยังไม่เลือก theme)" });
    });
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([themeFile(draft.name, draft.tokens)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `theme-${draft.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (dirty && !window.confirm("ทิ้งการแก้ที่ยังไม่บันทึก?")) return;
    startTransition(async () => {
      const read = readThemeFile(await file.text());
      if ("error" in read) {
        setProblems([]);
        return setMessage({ error: read.error });
      }
      settle(await saveTheme(null, read.name, read.tokens), `นำเข้า theme แล้ว`);
    });
  };

  return (
    <div className={styles.editor}>
      <aside className={styles.list} aria-label="theme ทั้งหมด">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            aria-pressed={theme.id === draft.id}
            onClick={() => select(theme)}
          >
            <span>{theme.name}</span>
            <small>
              {theme.builtIn ? "ในตัว" : "สร้างเอง"}
              {theme.id === defaultId ? " · ค่าเริ่มต้น" : ""}
            </small>
          </button>
        ))}
        <label className={styles.import}>
          นำเข้า JSON…
          <input
            type="file"
            accept="application/json,.json"
            disabled={pending}
            onChange={(e) => {
              upload(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </aside>

      <form
        className={styles.form}
        aria-label="แก้ theme"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {draft.builtIn && (
          <p className={styles.note}>theme ในตัวแก้ไม่ได้ กด &quot;ทำสำเนา&quot; เพื่อสร้าง theme ของคุณจากแบบนี้</p>
        )}
        <fieldset disabled={draft.builtIn || pending}>
          <label className={styles.wide}>
            ชื่อ theme
            <input
              value={draft.name}
              maxLength={40}
              required
              onChange={(e) => {
                const name = e.target.value;
                update((d) => {
                  d.name = name;
                });
              }}
            />
          </label>
          {COLORS.map(([key, label]) => (
            <label key={key} className={styles.color}>
              <input
                type="color"
                value={draft.tokens[key]}
                onChange={(e) => {
                  const value = e.target.value;
                  update((d) => {
                    d.tokens[key] = value;
                  });
                }}
              />
              <span>
                {label}
                <code>{draft.tokens[key]}</code>
              </span>
            </label>
          ))}
          <label>
            ฟอนต์
            <select
              value={draft.tokens["font.family"]}
              onChange={(e) => {
                const value = e.target.value as ThemeTokens["font.family"];
                update((d) => {
                  d.tokens["font.family"] = value;
                });
              }}
            >
              {FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
          <label>
            ขนาดตัวอักษร (12–18 px)
            <input
              type="number"
              min={12}
              max={18}
              value={draft.tokens["font.size"]}
              onChange={(e) => {
                const value = e.target.valueAsNumber;
                update((d) => {
                  d.tokens["font.size"] = value;
                });
              }}
            />
          </label>
          <label>
            ความโค้งมุม {draft.tokens.radius} px
            <input
              type="range"
              min={0}
              max={16}
              value={draft.tokens.radius}
              onChange={(e) => {
                const value = e.target.valueAsNumber;
                update((d) => {
                  d.tokens.radius = value;
                });
              }}
            />
          </label>
          <label>
            เงา
            <select
              value={draft.tokens.shadow}
              onChange={(e) => {
                const value = e.target.value as ThemeTokens["shadow"];
                update((d) => {
                  d.tokens.shadow = value;
                });
              }}
            >
              <option value="none">ไม่มี</option>
              <option value="soft">บาง</option>
              <option value="strong">ชัด</option>
            </select>
          </label>
          <label>
            ความแน่น
            <select
              value={draft.tokens.density}
              onChange={(e) => {
                const value = e.target.value as ThemeTokens["density"];
                update((d) => {
                  d.tokens.density = value;
                });
              }}
            >
              <option value="compact">แน่น</option>
              <option value="comfortable">โปร่ง</option>
            </select>
          </label>
        </fieldset>

        <div className={styles.actions}>
          {!draft.builtIn && (
            <button type="submit" className={styles.primary} disabled={pending || !dirty}>
              {draft.id === null ? "สร้าง theme" : "บันทึก"}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              update((d) => {
                d.id = null;
                d.builtIn = false;
                d.name = `สำเนา ${d.name}`.slice(0, 40);
              })
            }
          >
            ทำสำเนา
          </button>
          <button type="button" disabled={pending || dirty || draft.id === defaultId} onClick={makeDefault}>
            ตั้งเป็นค่าเริ่มต้น
          </button>
          <button type="button" onClick={download}>
            ส่งออก JSON
          </button>
          {!draft.builtIn && draft.id !== null && (
            <button type="button" className={styles.danger} disabled={pending} onClick={remove}>
              ลบ
            </button>
          )}
        </div>
        {message.error && (
          <div role="alert" className={styles.error}>
            {message.error}
            {problems.length > 0 && (
              <ul>
                {problems.map((p, i) => (
                  <li key={i}>
                    {p.pointer && <code>{p.pointer}</code>} {p.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {message.notice && <p role="status">{message.notice}</p>}
      </form>

      <Preview tokens={draft.tokens} />
    </div>
  );
}

/** A small Studio screen drawn with the unsaved tokens; themeStyle drops any value that fails its rule. */
function Preview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div className={styles.preview} style={themeStyle(tokens) as CSSProperties} aria-label="ตัวอย่าง theme">
      <div className={styles.pvCaption}>
        <b>Jester Report Studio</b>
        <span>รายงาน</span>
        <span>ตั้งค่า</span>
      </div>
      <div className={styles.pvBody}>
        <div className={styles.pvCard}>
          <b>ใบเสนอราคา</b>
          <span className={styles.pvMuted}>แก้ล่าสุด 15 พ.ย. 2569 · v3</span>
          <table>
            <thead>
              <tr>
                <th>รายการ</th>
                <th>ยอด</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>ค่าบริการ</td>
                <td>3,210.00</td>
              </tr>
            </tbody>
          </table>
          <div className={styles.pvRow}>
            <span className={styles.pvPrimary}>Publish</span>
            <span className={styles.pvButton}>Validate</span>
            <span className={styles.pvInput}>ค้นหา…</span>
          </div>
        </div>
        <div className={styles.pvRow}>
          <span className={styles.pvSuccess}>● สำเร็จ</span>
          <span className={styles.pvWarning}>● เตือน</span>
          <span className={styles.pvDanger}>● ล้มเหลว</span>
        </div>
      </div>
    </div>
  );
}
