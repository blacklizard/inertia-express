import config from "@blacklizard/eslint-blacklizard";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/tests/**",
      "**/*.test.ts",
      "**/*.spec.ts",
      "conformance/**",
      "docs/.vitepress/**",
    ],
  },
  ...config,
];
