"use client";

import { useEffect, useMemo, useState } from "react";

import type { Problem } from "@/lib/api-core";
import {
  emptyValue,
  emptyValues,
  fieldPointer,
  formSpec,
  pointers,
  renderBody,
  sampleValues,
  validate,
  type Errors,
  type Field,
  type FormValues,
  type ObjectField,
  type ScalarField,
  type Value,
} from "@/lib/form";
import { problemMessage } from "@/lib/messages";
import type { IssueSource } from "@/lib/workspace";

import styles from "./IssueForm.module.css";

export type IssuedPdf = { url: string; filename: string };

type Props = {
  templateId: string;
  source: IssueSource;
  onPdf: (pdf: IssuedPdf) => void;
  onBody?: (body: string) => void; // the request the form would send now (the developer dialog's curl)
};

/** Set the value at `path` (keys and row numbers) inside an immutable value tree. */
function setAt(value: Value, path: (string | number)[], next: Value): Value {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (Array.isArray(value)) return value.map((v, i) => (i === head ? setAt(v, rest, next) : v));
  const obj = (typeof value === "object" && value !== null ? value : {}) as Record<string, Value>;
  return { ...obj, [head]: setAt(obj[head as string] ?? "", rest, next) };
}

const getAt = (value: Value, path: (string | number)[]): Value =>
  path.reduce<Value>((v, k) => (v as Record<string | number, Value>)?.[k] ?? "", value);

const isRow = (f: Field): f is ObjectField => f.kind === "object" && f.fields.every((c) => c.kind !== "object" && c.kind !== "array");

function filenameOf(disposition: string | null, fallback: string): string {
  const star = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (star) return decodeURIComponent(star);
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

export function IssueForm({ templateId, source, onPdf, onBody }: Props) {
  const spec = useMemo(() => formSpec(source.reportJson, source.schemaJson), [source]);
  const [values, setValues] = useState<FormValues>(() => emptyValues(spec));
  const [filename, setFilename] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onBody?.(renderBody(templateId, spec, values, filename));
  }, [onBody, templateId, spec, values, filename]);

  const setParam = (key: string, v: Value) => setValues((s) => ({ ...s, params: { ...s.params, [key]: v } }));
  const setData = (path: (string | number)[], v: Value) => setValues((s) => ({ ...s, data: setAt(s.data, path, v) }));

  function focusFirst(found: Errors) {
    const first = Object.keys(found)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-pointer="${CSS.escape(first)}"]`);
      el?.scrollIntoView({ block: "center" });
      (el?.querySelector<HTMLElement>("input, select, textarea") ?? el)?.focus();
    });
  }

  async function issue() {
    const found = validate(spec, values);
    setErrors(found);
    setGeneral([]);
    if (Object.keys(found).length) return focusFirst(found);
    setBusy(true);
    try {
      const response = await fetch(`/issue/${templateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: renderBody(templateId, spec, values, filename),
      });
      if (response.ok) {
        const blob = await response.blob();
        const fallback = filename.trim() || `${templateId}-v${source.version}.pdf`;
        onPdf({ url: URL.createObjectURL(blob), filename: filenameOf(response.headers.get("content-disposition"), fallback) });
        return;
      }
      if (response.status === 401) return setGeneral(["session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"]);
      const problem = (await response.json()) as Problem;
      const known = pointers(spec, values);
      const atFields: Errors = {};
      const rest: string[] = [];
      for (const p of problem.problems ?? []) {
        const at = p.pointer ? fieldPointer(p.pointer, known) : null;
        if (at && !atFields[at]) atFields[at] = p.message;
        else rest.push(p.message);
      }
      setErrors(atFields);
      setGeneral([problemMessage(problem), ...rest]);
      focusFirst(atFields);
    } catch {
      setGeneral(["ส่งไม่สำเร็จ กรุณาลองใหม่"]);
    } finally {
      setBusy(false);
    }
  }

  function scalar(field: ScalarField, value: Value, pointer: string, onChange: (v: Value) => void, inRow = false) {
    const id = `f${pointer.replaceAll("/", "-")}`;
    const common = { id, "aria-invalid": Boolean(errors[pointer]), "aria-label": inRow ? field.label : undefined };
    const input =
      field.kind === "boolean" ? (
        <input {...common} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      ) : field.kind === "enum" ? (
        <select {...common} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? "— เลือก —" : "— ไม่ระบุ —"}</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.kind === "json" ? (
        <textarea {...common} rows={4} spellCheck={false} value={String(value)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          type={field.kind === "date" ? "date" : "text"}
          inputMode={field.kind === "decimal" || field.kind === "number" ? "decimal" : field.kind === "integer" ? "numeric" : undefined}
          maxLength={field.maxLength}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    const error = errors[pointer] && <span className={styles.error}>{errors[pointer]}</span>;
    if (inRow) {
      return (
        <td key={field.key} data-pointer={pointer}>
          {input}
          {error}
        </td>
      );
    }
    return (
      <div key={field.key} className={styles.field} data-pointer={pointer}>
        <label htmlFor={id}>
          {field.label}
          {field.required && <span className={styles.required}> *</span>}
        </label>
        {input}
        {field.description && <span className={styles.hint}>{field.description}</span>}
        {error}
      </div>
    );
  }

  function render(field: Field, path: (string | number)[], pointer: string): React.ReactNode {
    const value = getAt(values.data, path);
    if (field.kind === "object") {
      return (
        <fieldset key={pointer} className={styles.group} data-pointer={pointer}>
          <legend>
            {field.label}
            {field.required && <span className={styles.required}> *</span>}
          </legend>
          {field.description && <p className={styles.hint}>{field.description}</p>}
          {field.fields.map((f) => render(f, [...path, f.key], `${pointer}/${f.key}`))}
        </fieldset>
      );
    }
    if (field.kind === "array") {
      const rows = Array.isArray(value) ? value : [];
      const canAdd = field.maxItems === undefined || rows.length < field.maxItems;
      const canRemove = rows.length > field.minItems;
      const add = () => setData(path, [...rows, emptyValue(field.item)]);
      const remove = (i: number) => setData(path, rows.filter((_, j) => j !== i));
      const item = field.item;
      return (
        <fieldset key={pointer} className={styles.group} data-pointer={pointer}>
          <legend>
            {field.label}
            {field.required && <span className={styles.required}> *</span>}
          </legend>
          {field.description && <p className={styles.hint}>{field.description}</p>}
          {isRow(item) ? (
            <table className={styles.rows}>
              <thead>
                <tr>
                  <th aria-label="ลำดับ">#</th>
                  {item.fields.map((c) => (
                    <th key={c.key}>
                      {c.label}
                      {c.required && <span className={styles.required}> *</span>}
                    </th>
                  ))}
                  <th aria-label="ลบ" />
                </tr>
              </thead>
              <tbody>
                {rows.map((_, i) => (
                  <tr key={i}>
                    <td className={styles.index}>{i + 1}</td>
                    {item.fields.map((c) =>
                      scalar(
                        c as ScalarField,
                        getAt(values.data, [...path, i, c.key]),
                        `${pointer}/${i}/${c.key}`,
                        (v) => setData([...path, i, c.key], v),
                        true,
                      ),
                    )}
                    <td>
                      <button type="button" onClick={() => remove(i)} disabled={!canRemove} aria-label={`ลบแถวที่ ${i + 1}`}>
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            rows.map((_, i) => (
              <div key={i} className={styles.card}>
                {render({ ...item, label: `${field.label} ${i + 1}` }, [...path, i], `${pointer}/${i}`)}
                <button type="button" onClick={() => remove(i)} disabled={!canRemove}>
                  ลบ {field.label} {i + 1}
                </button>
              </div>
            ))
          )}
          <button type="button" className={styles.add} onClick={add} disabled={!canAdd}>
            + เพิ่มแถว
          </button>
          {errors[pointer] && <span className={styles.error}>{errors[pointer]}</span>}
        </fieldset>
      );
    }
    return scalar(field, value, pointer, (v) => setData(path, v));
  }

  const root = spec.data;
  return (
    <form
      className={styles.form}
      aria-label="ฟอร์มออกเอกสาร"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        issue();
      }}
    >
      <div className={styles.bar}>
        <span>version {source.version}</span>
        <span className={styles.spacer} />
        <button
          type="button"
          disabled={!source.sampleJson || busy}
          onClick={() => {
            setValues(sampleValues(spec, source.sampleJson!));
            setErrors({});
            setGeneral([]);
          }}
        >
          ใช้ข้อมูลตัวอย่าง
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValues(emptyValues(spec));
            setFilename("");
            setErrors({});
            setGeneral([]);
          }}
        >
          ล้างฟอร์ม
        </button>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? "กำลังออก PDF…" : "ออก PDF"}
        </button>
      </div>
      {general.length > 0 && (
        <ul role="alert" className={styles.general}>
          {general.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {spec.params.length > 0 && (
        <fieldset className={styles.group}>
          <legend>ข้อมูลเอกสาร</legend>
          {spec.params.map((f) =>
            scalar(f as ScalarField, values.params[f.key] ?? "", `/params/${f.key}`, (v) => setParam(f.key, v)),
          )}
        </fieldset>
      )}
      {root.kind === "object"
        ? root.fields.map((f) => render(f, [f.key], `/data/${f.key}`))
        : render(root, [], "/data")}
      <div className={styles.field}>
        <label htmlFor="issue-filename">ชื่อไฟล์ (เว้นว่างได้)</label>
        <input
          id="issue-filename"
          value={filename}
          placeholder={`${templateId}-v${source.version}.pdf`}
          onChange={(e) => setFilename(e.target.value)}
        />
      </div>
    </form>
  );
}
