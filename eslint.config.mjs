import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noLiteralDesignValues from "./tools/eslint/no-literal-design-values.mts";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Components use tokens only (CLAUDE.md, design system rules).
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: {
      sub80: { rules: { "no-literal-design-values": noLiteralDesignValues } },
    },
    rules: { "sub80/no-literal-design-values": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
