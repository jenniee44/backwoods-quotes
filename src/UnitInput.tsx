import { useState, useId } from "react";
import { units } from "./model";
export default function UnitInput({
  value,
  onChange,
  options = units,
  hint = "Type any custom unit.",
  onBlur,
  label = "Unit",
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  hint?: string;
  onBlur?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const listId = useId();
  return (
    <div className="unit-picker">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
      />
      {open && (
        <div id={listId} role="listbox" className="unit-options">
          {options
            .filter((u) => u.toLowerCase().includes(query.toLowerCase()))
            .map((u) => (
              <button
                key={u}
                type="button"
                role="option"
                aria-selected={u === value}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(u);
                  setOpen(false);
                }}
              >
                {u}
              </button>
            ))}
          <small>{hint}</small>
        </div>
      )}
    </div>
  );
}
