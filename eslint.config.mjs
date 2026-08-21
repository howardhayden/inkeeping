import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".sites-runtime/**", ".wrangler/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // C0-range expressions are deliberate hostile-input boundaries. Writing
    // them as ranges is easier to audit than enumerating invisible codepoints.
    rules: { "no-control-regex": "off" },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.flat["recommended-latest"].rules,
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["*.config.ts", "vite*.ts"],
    languageOptions: { globals: globals.node },
  },
);
