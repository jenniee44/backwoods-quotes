import { useEffect, useState, useRef } from "react";
// Keep the edit string separate from the numeric model. A blank edit calculates as zero.
export default function NumberInput({
  value,
  onChange,
  disabled = false,
  nullable = false,
  placeholder,
  step = "0.01",
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  disabled?: boolean;
  nullable?: boolean;
  placeholder?: string;
  step?: string;
}) {
  const focused = useRef(false);
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : String(value));
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        if (e.target.value === "0") setText("");
        else e.target.select();
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/^0+(?=\d)/, "");
        setText(raw);
        if (raw !== "") onChange(Number(raw));
      }}
      onBlur={() => {
        focused.current = false;
        if (text === "" && (nullable ? value != null : value !== 0))
          onChange(nullable ? NaN : 0);
        setText(text === "" ? (nullable ? "" : "0") : String(Number(text)));
      }}
    />
  );
}
