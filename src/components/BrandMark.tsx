import * as React from "react";
import carltonIcon from "@/assets/carlton-icon.png";
import { cn } from "@/lib/utils";

type BrandMarkProps = React.HTMLAttributes<HTMLDivElement> & {
  imageClassName?: string;
};

export function BrandMark({ className, imageClassName, ...props }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-card/80 shadow-sm ring-1 ring-border/80",
        className
      )}
      {...props}
    >
      <img
        src={carltonIcon}
        alt=""
        draggable={false}
        className={cn("h-full w-full object-contain p-1", imageClassName)}
      />
    </div>
  );
}
