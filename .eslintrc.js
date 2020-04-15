module.exports = {
  plugins: [
    'jest',
  ],
  extends: [
    'airbnb-typescript/base',
    'plugin:jest/recommended',
  ],
  parserOptions: {
    project: [
      './tsconfig.json',
      './test/tsconfig.json',
    ],
  },
  rules: {
    'no-console': 0,
  },
};
