module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'import', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:security/recommended',
    'prettier'
  ],
  rules: {
    'import/no-unresolved': 'off',
    '@typescript-eslint/no-misused-promises': 'error'
  }
};

