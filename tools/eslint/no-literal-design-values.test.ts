import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-literal-design-values.mts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-literal-design-values", rule, {
  valid: [
    `<div className="bg-surface text-primary p-inset-md rounded-control" />`,
    `<button className="bg-(--button-bg) text-(color:--button-fg) px-(--button-padding-x)" />`,
    `<div className="grid grid-cols-[1fr_2fr] data-[state=open]:bg-raised" />`,
    `<div style={{ background: "var(--color-accent)", width: "100%", margin: 0 }} />`,
    "<div style={{ background: `var(${name})` }} />",
    `<div style={{ display: "flex", opacity: 0.5, zIndex: 2 }} />`,
    `<a href="#feed" id="main">Skip</a>`,
    `const label = "Week #3";`,
    `import styles from "./x.css";`,
  ],
  invalid: [
    {
      code: `<div className="text-primary" style={{ color: "#fff" }} />`,
      errors: [{ messageId: "style" }],
    },
    { code: `const c = "#0af";`, errors: [{ messageId: "color" }] },
    { code: `const c = "oklch(0.6 0.2 250)";`, errors: [{ messageId: "color" }] },
    { code: "const c = `rgb(0 0 0 / ${a})`;", errors: [{ messageId: "color" }] },
    { code: `<div className="bg-[#f00]" />`, errors: [{ messageId: "color" }] },
    { code: `<div className="p-[3px]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="hover:-mt-[2px]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="rounded-tl-[6px]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="font-[Inter]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="[padding:3px]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div style={{ borderRadius: 6 }} />`, errors: [{ messageId: "style" }] },
    { code: `<div style={{ padding: "12px" }} />`, errors: [{ messageId: "style" }] },
    { code: `<div style={{ marginTop: -4 }} />`, errors: [{ messageId: "style" }] },
    { code: `<div style={{ fontFamily: "Inter, sans-serif" }} />`, errors: [{ messageId: "style" }] },
  ],
});
