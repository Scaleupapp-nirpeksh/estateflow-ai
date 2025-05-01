module.exports = {
    env: {
      node: true,
      commonjs: true,
      es2021: true,
      jest: true,
    },
    extends: [
      'eslint:recommended',
      'plugin:node/recommended',
      'plugin:jest/recommended',
      'prettier',
    ],
    parserOptions: {
      ecmaVersion: 2022,
    },
    plugins: ['jest'],
    rules: {
      'node/exports-style': ['error', 'module.exports'],
      'node/file-extension-in-import': ['error', 'always'],
      'node/prefer-global/buffer': ['error', 'always'],
      'node/prefer-global/console': ['error', 'always'],
      'node/prefer-global/process': ['error', 'always'],
      'node/prefer-global/url-search-params': ['error', 'always'],
      'node/prefer-global/url': ['error', 'always'],
      'node/prefer-promises/dns': 'error',
      'node/prefer-promises/fs': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
    },
  };