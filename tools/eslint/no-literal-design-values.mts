import type { Rule } from "eslint";
import type * as ESTree from "estree";

/**
 * Components may not contain literal colours, radii, font families or
 * spacing values. They use tokens from src/styles/tokens.css instead.
 *
 * Reports:
 * - colour literals in any string (`#0af`, `rgb(…)`, `oklch(…)`, …)
 * - Tailwind arbitrary values on design utilities (`bg-[#fff]`, `p-[3px]`,
 *   `rounded-[6px]`, `font-[Inter]`) and arbitrary properties (`[color:red]`)
 * - literal values for design properties in a `style` prop
 *
 * Allowed: token utilities (`bg-surface`), variable utilities
 * (`bg-(--button-bg)`), and `style` values that are `var(--…)`, keywords,
 * percentages or computed at runtime.
 */

const HEX = /(?:^|[\s:;,("'[])(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}))(?![0-9a-z_-])/i;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i;

const DESIGN_UTILITY =
  "(?:bg|text|border(?:-[xytrblse])?|outline|ring|fill|stroke|from|via|to|" +
  "decoration|accent|caret|shadow|rounded(?:-[a-z]{1,2})?|font|leading|tracking|" +
  "p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|" +
  "top|right|bottom|left|start|end|w|h|size|min-w|min-h|max-w|max-h|indent|basis|" +
  "scroll-[mp][xytrblse]?)";
const ARBITRARY_VALUE = new RegExp(
  `(?<![\\w-])!?-?${DESIGN_UTILITY}-\\[[^\\]\\s]+\\](?!:)`,
);
const ARBITRARY_PROPERTY = /(?<![\w-])\[[a-z-]+:[^\]\s]+\](?!:)/;

const DESIGN_PROPERTY =
  /^(?:color|background\w*|border\w*|outline\w*|boxShadow|textShadow|fill|stroke|accentColor|caretColor|font\w*|lineHeight|letterSpacing|padding\w*|margin\w*|gap|rowGap|columnGap|inset\w*|top|right|bottom|left|width|height|minWidth|minHeight|maxWidth|maxHeight|blockSize|inlineSize)$/;
const ALLOWED_STYLE_VALUE =
  /^(?:\s*(?:var\(--[\w-]+\)|0|auto|none|inherit|initial|unset|currentColor|transparent|\d+(?:\.\d+)?%)\s*)+$/i;

/** Attributes whose values are references, not design values. */
const SKIPPED_ATTRIBUTES = new Set(["href", "id", "htmlFor", "src"]);

type JSXAttribute = {
  type: "JSXAttribute";
  name: { type: string; name: unknown };
  value: { type: string; expression?: ESTree.Expression } | null;
};

function attributeName(node: unknown): string | null {
  const attr = node as JSXAttribute | null;
  if (attr?.type !== "JSXAttribute") return null;
  return typeof attr.name.name === "string" ? attr.name.name : null;
}

function staticString(node: ESTree.Node): string | null {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function propertyName(prop: ESTree.Property): string | null {
  if (prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
    return prop.key.value;
  }
  return null;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid literal colours, radii, font families and spacing in components; use tokens",
    },
    schema: [],
    messages: {
      color: "Literal colour `{{value}}`. Use a colour token.",
      arbitrary:
        "Arbitrary Tailwind value `{{value}}`. Use a token utility or `(--token)`.",
      style: "Literal `{{property}}` value. Use `var(--token)`.",
    },
  },
  create(context) {
    const reported = new WeakSet<ESTree.Node>();

    function checkString(node: ESTree.Node, text: string) {
      if (reported.has(node)) return;
      const color = HEX.exec(text)?.[1] ?? COLOR_FN.exec(text)?.[0];
      if (color) {
        reported.add(node);
        context.report({ node, messageId: "color", data: { value: color } });
        return;
      }
      const arbitrary =
        ARBITRARY_VALUE.exec(text)?.[0] ?? ARBITRARY_PROPERTY.exec(text)?.[0];
      if (arbitrary) {
        reported.add(node);
        context.report({ node, messageId: "arbitrary", data: { value: arbitrary } });
      }
    }

    function checkStyleObject(object: ESTree.ObjectExpression) {
      for (const prop of object.properties) {
        if (prop.type !== "Property") continue;
        const name = propertyName(prop);
        if (!name || !DESIGN_PROPERTY.test(name)) continue;

        const value = prop.value as ESTree.Expression;
        const number =
          value.type === "Literal" && typeof value.value === "number"
            ? value.value
            : value.type === "UnaryExpression" &&
                value.argument.type === "Literal" &&
                typeof value.argument.value === "number"
              ? value.argument.value
              : null;
        const text = staticString(value);

        if ((number !== null && number !== 0) || (text !== null && !ALLOWED_STYLE_VALUE.test(text))) {
          reported.add(value);
          context.report({ node: value, messageId: "style", data: { property: name } });
        }
      }
    }

    return {
      JSXAttribute(node: Rule.Node) {
        const attr = node as unknown as JSXAttribute;
        if (attributeName(attr) !== "style") return;
        const expression = attr.value?.expression;
        if (expression?.type === "ObjectExpression") checkStyleObject(expression);
      },
      Literal(node: ESTree.Literal & Rule.NodeParentExtension) {
        if (typeof node.value !== "string") return;
        if (node.parent.type === "ImportDeclaration") return;
        const attr = attributeName(node.parent);
        if (attr && SKIPPED_ATTRIBUTES.has(attr)) return;
        checkString(node, node.value);
      },
      TemplateLiteral(node: ESTree.TemplateLiteral & Rule.NodeParentExtension) {
        checkString(node, node.quasis.map((q) => q.value.cooked ?? "").join(" "));
      },
    };
  },
};

export default rule;
