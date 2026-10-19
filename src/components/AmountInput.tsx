import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type AmountInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function AmountInput({ value, onValueChange, onFocus, onBlur, ...props }: AmountInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft((current) => Number(current) === value ? current : String(value));
  }, [value]);

  return (
    <Input {...props} type="number" inputMode="decimal" min={0} step="0.01"
      value={draft} placeholder="0"
      onFocus={(event) => {
        if (Number(draft) === 0) event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value.replace(/^0+(?=\d)/, "");
        setDraft(next);
        onValueChange(Number(next));
      }}
      onBlur={(event) => {
        setDraft(String(Number(draft)));
        onBlur?.(event);
      }}
    />
  );
}