interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  note?: string;
  /** Replaces the numeric readout entirely, when the number means nothing to a reader. */
  valueLabel?: string;
  big?: boolean;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 1, suffix = "", note, valueLabel, big, onChange }: Props) {
  return (
    <label className={"field" + (big ? " big" : "")}>
      <span>
        {label}
        <em>{valueLabel ?? `${value}${suffix}${note ? ` · ${note}` : ""}`}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
