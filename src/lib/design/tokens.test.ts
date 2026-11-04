import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modes, tokens, type TokenLayer } from "./tokens";

const css = readFileSync(
  new URL("../../styles/tokens.css", import.meta.url),
  "utf8",
);

function declaredIn(section: string) {
  const names = [...section.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(
    (m) => m[1] as string,
  );
  return [...new Set(names)].filter((n) => !n.startsWith("--palette-")).sort();
}

const [, primitive = "", semantic = "", component = ""] = css.split(
  /\/\* \d\. (?:Primitives|Semantic|Component) -+ \*\//,
);
const sections: Record<TokenLayer, string> = { primitive, semantic, component };

describe("token manifest", () => {
  it.each(Object.keys(sections) as TokenLayer[])(
    "lists exactly the %s tokens declared in tokens.css",
    (layer) => {
      const listed = tokens[layer].flatMap((g) => g.tokens).sort();
      expect(listed).toEqual(declaredIn(sections[layer]));
    },
  );

  it("has no token listed twice", () => {
    const all = Object.values(tokens).flatMap((groups) =>
      groups.flatMap((g) => g.tokens),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("covers every mode value with a selector in tokens.css", () => {
    for (const [attr, values] of Object.entries(modes)) {
      for (const value of values) {
        expect(css).toContain(`[data-${attr}="${value}"]`);
      }
    }
  });

  it("keeps component tokens on the semantic layer", () => {
    // Every component token, not just --button-*: a component token that
    // reached past the semantic layer to a primitive would break theming.
    const refs = [
      ...component.matchAll(/^\s*--[a-z0-9-]+:\s*var\((--[a-z0-9-]+)\)\s*;/gm),
    ].map((m) => m[1] as string);

    expect(refs.length).toBe(declaredIn(component).length);
    for (const ref of refs) {
      expect(declaredIn(semantic), ref).toContain(ref);
    }
  });
});
