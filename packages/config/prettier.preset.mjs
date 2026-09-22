// Shared Prettier options. Mirrors the root .prettierrc.json so tooling that
// imports the preset programmatically gets the same formatting.
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
};
