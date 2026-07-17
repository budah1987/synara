import { useCallback, useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";

export type SlidingSegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

export function SlidingSegmentedControl<T extends string>({
  value,
  options,
  ariaLabel,
  className,
  onValueChange,
}: {
  value: T;
  options: readonly SlidingSegmentedControlOption<T>[];
  ariaLabel: string;
  className?: string;
  onValueChange: (value: T) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const pillPositionedRef = useRef(false);

  const movePill = useCallback((nextValue: T, animate: boolean) => {
    const pill = pillRef.current;
    const button = buttonRefs.current.get(nextValue);
    if (!pill || !button) return;

    if (!animate) {
      const previousTransition = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${button.offsetLeft}px)`;
      pill.style.width = `${button.offsetWidth}px`;
      void pill.offsetWidth;
      pill.style.transition = previousTransition;
      return;
    }

    pill.style.transform = `translateX(${button.offsetLeft}px)`;
    pill.style.width = `${button.offsetWidth}px`;
  }, []);

  useLayoutEffect(() => {
    const shouldAnimate = pillPositionedRef.current;
    movePill(value, shouldAnimate);
    pillPositionedRef.current = true;
  }, [movePill, value]);

  useLayoutEffect(() => {
    const repositionWithoutAnimation = () => movePill(value, false);
    const root = rootRef.current;
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(repositionWithoutAnimation) : null;

    if (root) observer?.observe(root);
    for (const button of buttonRefs.current.values()) {
      observer?.observe(button);
    }
    window.addEventListener("resize", repositionWithoutAnimation);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", repositionWithoutAnimation);
    };
  }, [movePill, value]);

  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn("relative isolate grid rounded-lg bg-muted/45 p-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0.5 left-0 z-0 h-[calc(100%-0.25rem)] w-0 rounded-md bg-background shadow-sm transition-[transform,width] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,width] motion-reduce:transition-none"
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) {
                buttonRefs.current.set(option.value, node);
              } else {
                buttonRefs.current.delete(option.value);
              }
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "relative z-10 rounded-md px-2 py-1.5 text-xs outline-none transition-colors duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
