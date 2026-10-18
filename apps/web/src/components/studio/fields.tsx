"use client";

import { explorerTx } from "@updraft/sdk";
import type { ReactNode } from "react";
import { type Dur, type Unit, UNIT_LABEL } from "./format";
import type { TxState } from "./tx";

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sd-field${className ? ` ${className}` : ""}`}>
      <label className="sd-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="sd-err" id={`${id}-err`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="sd-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const described = (id: string, error?: string | null, hint?: boolean) =>
  error ? `${id}-err` : hint ? `${id}-hint` : undefined;

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  error,
  hint,
  big,
  suffix,
  inputMode,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  error?: string | null;
  hint?: boolean;
  big?: boolean;
  suffix?: ReactNode;
  inputMode?: "decimal" | "numeric" | "text";
  disabled?: boolean;
}) {
  return (
    <div className={`sd-input${big ? " big" : ""}${error ? " bad" : ""}${disabled ? " off" : ""}`}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, error, hint)}
      />
      {suffix ? <span className="u">{suffix}</span> : null}
    </div>
  );
}

export function DurationInput({
  id,
  value,
  onChange,
  units = ["m", "h", "d"],
  error,
  hint,
  disabled,
}: {
  id: string;
  value: Dur;
  onChange: (v: Dur) => void;
  units?: Unit[];
  error?: string | null;
  hint?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`sd-input dur${error ? " bad" : ""}${disabled ? " off" : ""}`}>
      <input
        id={id}
        value={value.v}
        onChange={(e) => onChange({ ...value, v: e.target.value })}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, error, hint)}
      />
      <select
        aria-label="Unit"
        value={value.unit}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, unit: e.target.value as Unit })}
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {UNIT_LABEL[u]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sd-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} className="sd-switch" onClick={() => onChange(!checked)}>
      <span className="track" aria-hidden="true">
        <i />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <svg className="sd-check" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="#c7d83b" stroke="#2e4527" strokeWidth="1.5" />
      <path d="M6.5 11.5 L9.6 14.4 L15.6 7.8" fill="none" stroke="#2e4527" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="sd-check" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="none" stroke="#9a3b1f" strokeWidth="1.5" />
      <path d="M7.5 7.5 L14.5 14.5 M14.5 7.5 L7.5 14.5" stroke="#9a3b1f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** One line under an action: what is being signed, then the hash, then the outcome. */
export function TxNote({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  const link = "hash" in state && state.hash ? (
    <a className="mono" href={explorerTx(state.hash)} target="_blank" rel="noreferrer">
      {state.hash.slice(0, 10)}…{state.hash.slice(-6)}
    </a>
  ) : null;
  return (
    <p className={`sd-tx ${state.status}`} role="status">
      {state.status === "signing" && <>Confirm “{state.label}” in your wallet.</>}
      {state.status === "pending" && <>{state.label}: sent, waiting for the block. {link}</>}
      {state.status === "done" && <>{state.label}: done. {link}</>}
      {state.status === "failed" && (
        <>
          {state.label} didn’t go through. {state.error} {link}
        </>
      )}
    </p>
  );
}
