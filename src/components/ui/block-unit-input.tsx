import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Input } from "@/components/ui/input";
import { BLOCK_UNIT_PREFIX, sanitizeBlockUnitDigits } from "@/lib/block-unit";
import { cn } from "@/lib/utils";

type BlockUnitInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (value: string) => void;
};

export const BlockUnitInput = forwardRef<HTMLInputElement, BlockUnitInputProps>(
  ({ className, value = "", onValueChange, ...props }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-medium text-muted-foreground">
        {BLOCK_UNIT_PREFIX}
      </span>
      <Input
        {...props}
        ref={ref}
        value={sanitizeBlockUnitDigits(value)}
        onChange={(event) => onValueChange?.(sanitizeBlockUnitDigits(event.target.value))}
        inputMode="numeric"
        maxLength={2}
        pattern="[0-9]{2}"
        placeholder="01"
        className={cn("pl-14 font-mono tracking-normal", className)}
      />
    </div>
  ),
);

BlockUnitInput.displayName = "BlockUnitInput";
