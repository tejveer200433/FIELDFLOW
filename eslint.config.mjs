import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,

  {
    rules: {
      /*
       * Temporary compatibility rules for the existing FIELD-FLOW codebase.
       * These should be addressed gradually in a dedicated React cleanup.
       */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react/no-unescaped-entities": "off",

      /*
       * Keep dependency and image issues visible without blocking builds.
       */
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
      "import/no-anonymous-default-export": "warn"
    }
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "desktop-agent/src-tauri/target/**"
  ])
]);
