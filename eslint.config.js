import js from '@eslint/js'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import storybook from 'eslint-plugin-storybook'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['**/dist', '**/storybook-static', '**/coverage']),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*'],
              message:
                'Use relative imports in packages/ui: tsc does not rewrite path aliases in the published .d.ts files.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tailwind classes in packages/ui must come from the design system:
    // no arbitrary values, and no classes the theme doesn't define (Tailwind's
    // spacing, radius and container scales are cleared in theme.css).
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    extends: [betterTailwindcss.configs['correctness-error']],
    settings: {
      'better-tailwindcss': {
        cwd: 'packages/ui',
        entryPoint: 'src/styles/styles.css',
      },
    },
    rules: {
      // `dark` is the theme switch matched by the dark custom variant, not a utility.
      'better-tailwindcss/no-unknown-classes': [
        'error',
        { ignore: ['^dark$'] },
      ],
      'better-tailwindcss/no-restricted-classes': [
        'error',
        {
          restrict: [
            {
              // The utility itself (after any variants) ends in an
              // arbitrary value: p-[13px], bg-(--x), [mask-type:alpha],
              // bg-red/[0.5]. Arbitrary variants like
              // has-data-[icon=x]: and [&_svg]: are still allowed.
              pattern: String.raw`^.*[\])](?:\/[\w.%-]+)?!?$`,
              message:
                'Arbitrary value in "$0": use a design token from theme.css (or add one there).',
            },
          ],
        },
      ],
    },
  },
  storybook.configs['flat/recommended'],
  prettier,
])
