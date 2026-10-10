import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/android/**', '**/ios/**', 'apps/**', 'agent-tools/**', 'dist/**', '**/lib/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The classic hook rules. The React Compiler rules in the plugin's presets flag
    // Reanimated shared-value writes and the latest-ref pattern this library relies on.
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
