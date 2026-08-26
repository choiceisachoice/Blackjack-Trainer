import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Treat a leading underscore as "intentionally unused" (matches tsc).
      // ignoreRestSiblings covers the omit-by-destructuring idiom — pulling
      // props out specifically to keep them off a DOM node and spreading the
      // rest. The named bindings are unused on purpose; that IS the point.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  /*
    A promise nobody is holding.

    `tseslint.configs.recommended` above is the syntax-only preset, so
    `no-floating-promises` — which needs type information — was not running.
    That is the rule that catches an async call whose failure goes nowhere, and
    this codebase has the scar: three writes on the payment path failed
    silently because `supabase-js` neither throws nor reports a write that
    matched nothing, and only one of the three call sites remembered.

    All twenty existing sites turned out to be safe on inspection — mostly
    `navigate()`, which returns a promise in react-router 7, plus loaders that
    already catch internally. They carry `void` now, which is the point: the
    rule does not forbid fire-and-forget, it forbids *silent* fire-and-forget,
    and `void` is a signature saying somebody looked.

    Its own block, scoped to `src`, because type-aware parsing needs a tsconfig
    project and the config files at the repo root are not in one.
  */
  {
    files: ['src/**/*.{ts,tsx}'],
    // Tests live in `tsconfig.test.json`, not the app project, and a dropped
    // promise in a test harms nobody — not worth a second project service.
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  /*
    Hard-coded copy in a screen.

    The seven-language sweep was verified with a script that looked for text
    directly after a `>`. Nine strings did not sit there — a label after an
    expression, `{busy ? <Spinner/> : null} Go Pro`, or a sentence on its own
    line — and every one of them shipped in English on a German page. Widening
    the pattern was not the answer: it turned up 794 hits, nearly all of them
    type declarations. A rule that actually parses JSX is.

    Scoped to components, because that is where copy reaches a reader. Test
    files and the message files themselves are exempt by definition.
  */
  {
    files: ['src/**/*.tsx'],
    // The dev harnesses are English-only on purpose: they are read by whoever
    // is building the thing, never by a user, and they never reach production.
    ignores: [
      '**/*.test.tsx',
      'src/pages/DevPreview.tsx',
      'src/pages/LoaderGallery.tsx',
      'src/pages/LevelGallery.tsx',
      'src/pages/MotionFilm.tsx',
    ],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          // Only what a person reads. Attributes are handled by an allow-list
          // below rather than by scanning every prop, which would flag class
          // names, test ids and every other string the DOM needs.
          mode: 'jsx-text-only',
          'should-validate-template': true,
          /*
            Text that is the same in all seven languages, so translating it
            would be a way of getting it wrong.

            The first two entries are the plugin's own defaults (pure ASCII
            punctuation/digits, and anything wholly non-ASCII) — naming this
            option replaces them, so they have to be repeated. Everything after
            is a proper noun or a term of art: the product's name, the printed
            felt, the standard Hi-Lo abbreviations, and the published names of
            the deviation sets. A German player looks for "Illustrious 18" as
            well; a translated version would send them searching for a book
            that does not exist.

            Entries are full-match regexes.
          */
          words: {
            exclude: [
              '[0-9!-/:-@[-`{-~]+',
              '[^\\u0000-\\u007F]+',
              'Blackjack Trainer',
              'Blackjack Card Counting Trainer',
              'BLACKJACK',
              'TRAINER',
              'XP',
              'PRO',
              'INSURANCE PAYS 2 TO 1',
              'RC:',
              'TC:',
              'TC \\+3',
              'Hi-Lo',
              'Illustrious 18',
              '\\+ Fab 4',
              '· S17 / H17',
              'CHF 0',
            ],
          },
        },
      ],
    },
  },
])
