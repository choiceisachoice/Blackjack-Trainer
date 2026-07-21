/**
 * Legal documents are content, not markup. Modelling them as data (rather than
 * hand-laid JSX) keeps the prose readable in one place, lets both pages share
 * one renderer, and makes the required sections testable.
 */

/** A block inside a section: a paragraph, or a bullet list. */
export type LegalBlock = string | { readonly list: readonly string[] }

export interface LegalSection {
  readonly heading: string
  readonly blocks: readonly LegalBlock[]
}

export interface LegalDoc {
  readonly title: string
  /** One-line summary shown under the title, before the numbered sections. */
  readonly intro: string
  readonly sections: readonly LegalSection[]
}
