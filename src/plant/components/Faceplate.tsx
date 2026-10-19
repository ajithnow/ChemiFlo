import type { CSSProperties, ReactNode } from "react";

export const FaceplateSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="plant-fp-section">
    <h4 className="plant-fp-title">{title}</h4>
    {children}
  </section>
);

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}

export const NumberInput = ({ value, onChange, label, min, max, step = 1 }: NumberInputProps) => (
  <input
    type="number"
    className="plant-fp-number"
    aria-label={label}
    value={value}
    min={min}
    max={max}
    step={step}
    onChange={event => {
      const next = event.target.valueAsNumber;
      if (Number.isNaN(next)) return;
      onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
    }}
  />
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="plant-fp-field">
    <span>{label}</span>
    {children}
  </div>
);

export interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

export const Segmented = <T extends string | number>({ label, value, options, onChange, disabled }: SegmentedProps<T>) => (
  <div className="plant-fp-segmented" role="radiogroup" aria-label={label}>
    {options.map(option => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        disabled={disabled}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export interface RangeInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
}

export const RangeInput = ({ label, value, min, max, step = 1, display, onChange }: RangeInputProps) => {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className="plant-fp-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        onChange={event => onChange(event.target.valueAsNumber)}
      />
      <output>{display}</output>
    </label>
  );
};

export interface ReadoutProps {
  label: string;
  value: string;
  unit?: string;
  title?: string;
  primary?: boolean;
}

export const Readout = ({ label, value, unit, title, primary }: ReadoutProps) => (
  <div className={`plant-fp-readout${primary ? " is-primary" : ""}`} title={title}>
    <span>{label}</span>
    <output>
      {value}
      {unit && <small> {unit}</small>}
    </output>
  </div>
);

export const StreamLabel = ({ stream, children }: { stream: "hot" | "cold"; children: ReactNode }) => (
  <span className={`plant-stream-label plant-stream-${stream}`}>
    <span className="plant-dot" aria-hidden />
    {children}
  </span>
);
