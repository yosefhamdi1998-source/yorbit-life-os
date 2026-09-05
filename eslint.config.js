import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      // These two spreads are load-bearing. The config objects above are
      // brought in with `...pluginJs.configs.recommended`, but this `rules`
      // key then REPLACES the whole rules object rather than merging into it,
      // so every recommended rule was silently switched off - `no-undef`
      // included.
      //
      // What that cost: Coach.jsx called computeSavingsRate() without
      // importing it. `npm run lint` passed, the build passed, and the AI
      // Coach - the feature behind the Go Pro button - crashed to the error
      // boundary for every user who opened it. A linter that reports zero
      // problems while a page cannot render is worse than no linter, because
      // it is trusted.
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      // Restoring the recommended set switched this on across 37 sites - all
      // of them apostrophes and quotes in ordinary prose, which JSX renders
      // correctly. Kept off deliberately: 37 cosmetic errors is how a lint
      // run becomes something people skim past, and skimming past it is what
      // let a ReferenceError reach production. Correctness rules stay on.
      "react/no-unescaped-entities": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
