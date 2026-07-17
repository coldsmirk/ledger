// Sealed shared config (github.com/coldsmirk/canon): React rules on, `lib` for the strict
// publishable package.json checks. CSS is linted separately by Stylelint (see stylelint.config.ts).
import { defineEslintConfig } from "@coldsmirk/eslint-config";

export default defineEslintConfig({ type: "lib", react: true });
