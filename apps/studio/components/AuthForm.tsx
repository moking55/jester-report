"use client";

import { useActionState } from "react";

import type { FormState } from "@/lib/actions/auth";

import styles from "./AuthForm.module.css";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "password";
  autoComplete?: string;
  hint?: string;
};

type Props = {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
};

export function AuthForm({ action, fields, submit }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={styles.form}>
      {fields.map((f) => (
        <div key={f.name} className={styles.field}>
          <label htmlFor={`f-${f.name}`}>{f.label}</label>
          <input
            id={`f-${f.name}`}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            defaultValue={f.type === "password" ? undefined : state.values?.[f.name]}
            aria-describedby={f.hint ? `f-${f.name}-hint` : undefined}
            required
          />
          {f.hint && <small id={`f-${f.name}-hint`}>{f.hint}</small>}
        </div>
      ))}
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "กำลังดำเนินการ…" : submit}
      </button>
    </form>
  );
}
