"use client";

import { useTransition } from "react";

import { chooseTheme } from "@/lib/actions/auth";

type Props = { themes: { id: string; name: string }[]; current: string | undefined };

export function ThemePicker({ themes, current }: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Theme"
      value={current}
      disabled={pending}
      onChange={(e) => startTransition(() => chooseTheme(e.target.value))}
    >
      {themes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
