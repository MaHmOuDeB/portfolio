/** @type {import('stylelint').Config} */
const config = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['src/styles/tokens.css'],
  rules: {
    'color-no-hex': true,
    // Tailwind v4 uses the string form: @import "tailwindcss";
    'import-notation': 'string',
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['theme', 'apply', 'source', 'utility', 'variant', 'custom-variant', 'plugin', 'config'],
      },
    ],
  },
};

export default config;
