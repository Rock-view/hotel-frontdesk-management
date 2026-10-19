import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AmountInput } from "@/components/AmountInput";

function Field() {
  const [value, setValue] = useState(0);
  return <AmountInput aria-label="Discount" value={value} onValueChange={setValue} />;
}

describe("Booking amount entry", () => {
  it("removes leading zeroes and restores zero when cleared", () => {
    render(<Field />);
    const input = screen.getByRole("spinbutton", { name: "Discount" });
    expect(input).toHaveValue(0);
    fireEvent.change(input, { target: { value: "02000" } });
    expect(input).toHaveValue(2000);
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("placeholder", "0");
    fireEvent.blur(input);
    expect(input).toHaveValue(0);
    fireEvent.change(input, { target: { value: "0.25" } });
    expect(input).toHaveValue(0.25);
  });
});