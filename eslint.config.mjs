import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Besides Next's defaults, this enforces the research-only boundary in code:
 * application source may not make outbound network calls or send mail. The
 * app prepares packages; a human sends them.
 */
const OUTBOUND = "The app never contacts anyone or submits anything (see src/core/permissions.ts).";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "data/**", "next-env.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/await-thenable": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: OUTBOUND }, { name: "XMLHttpRequest", message: OUTBOUND }, { name: "WebSocket", message: OUTBOUND }],
      "no-restricted-imports": [
        "error",
        {
          paths: ["http", "https", "net", "tls", "dgram", "node:http", "node:https", "node:net", "node:tls", "node:dgram", "nodemailer", "axios", "undici", "node-fetch", "got"].map(
            (name) => ({ name, message: OUTBOUND }),
          ),
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
];

export default config;
