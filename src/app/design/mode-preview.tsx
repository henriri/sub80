"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  defaultModes,
  modeAttributes,
  modes,
  type Modes,
} from "@/lib/design/tokens";

const ModeContext = createContext<Modes>(defaultModes);

type ModePreviewProps = {
  /** Rendered once per theme × palette combination. */
  sample: ReactNode;
  children: ReactNode;
};

export function ModePreview({ sample, children }: ModePreviewProps) {
  const [current, setCurrent] = useState<Modes>(defaultModes);

  return (
    <ModeContext.Provider value={current}>
      <form
        aria-label="Preview modes"
        className="sticky top-0 z-10 flex flex-wrap gap-stack-md border-b-(length:--border-width-default) border-default bg-surface p-inset-md"
        onSubmit={(e) => e.preventDefault()}
      >
        {(Object.keys(modes) as (keyof Modes)[]).map((attr) => (
          <fieldset key={attr} className="flex flex-wrap items-center gap-inline-sm">
            <legend className="sr-only">{attr}</legend>
            <span aria-hidden className="text-small text-secondary">
              {attr}
            </span>
            {modes[attr].map((value) => (
              <label
                key={value}
                className="inline-flex min-h-touch cursor-pointer items-center rounded-control border-(length:--border-width-default) border-default px-inset-md text-small has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-(length:--border-width-focus) has-focus-visible:outline-offset-(--space-focus-offset) has-focus-visible:outline-focus"
              >
                <input
                  type="radio"
                  name={attr}
                  value={value}
                  checked={current[attr] === value}
                  onChange={() => setCurrent({ ...current, [attr]: value })}
                  className="sr-only"
                />
                {value}
              </label>
            ))}
          </fieldset>
        ))}
      </form>

      <div {...modeAttributes(current)} className="bg-canvas text-primary">
        {children}

        <section aria-labelledby="matrix" className="flex flex-col gap-stack-md p-inset-lg">
          <h2 id="matrix" className="text-heading-md">
            Theme × palette
          </h2>
          <div className="grid gap-stack-md md:grid-cols-2">
            {modes.theme.flatMap((theme) =>
              modes.palette.map((palette) => (
                <div
                  key={`${theme}-${palette}`}
                  {...modeAttributes({ ...current, theme, palette })}
                  className="flex flex-col gap-stack-sm rounded-surface border-(length:--border-width-default) border-default bg-canvas p-inset-md text-primary"
                >
                  <p className="text-small text-secondary">
                    {theme} · {palette}
                  </p>
                  {sample}
                </div>
              )),
            )}
          </div>
        </section>
      </div>
    </ModeContext.Provider>
  );
}

/** The token's computed value in the current preview mode. */
export function TokenValue({ name }: { name: string }) {
  // Subscribing re-renders on mode change, which re-runs the ref below.
  useContext(ModeContext);
  return (
    <code
      className="font-code text-small text-secondary"
      ref={(el) => {
        if (el) el.textContent = getComputedStyle(el).getPropertyValue(name).trim();
      }}
    />
  );
}
