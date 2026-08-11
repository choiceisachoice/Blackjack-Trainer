/**
 * Just enough of a translator to build a sentence.
 *
 * Pure modules — the curriculum, the recommendation, the welcome copy — hold
 * translation keys and need to turn them into text. Importing i18next there
 * would pull a stateful singleton into code that is otherwise a set of
 * functions, and would drag it into every test that touches them. So they take
 * a translator as an argument instead, typed by this alias: components pass
 * `t` from `useTranslation`, tests pass `i18next.t` or a stub.
 *
 * Structurally compatible with i18next's `TFunction` for the calls we make,
 * without depending on its types.
 */
export type Translate = (key: string, vars?: Record<string, unknown>) => string
