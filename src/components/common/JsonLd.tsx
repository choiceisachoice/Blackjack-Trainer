/**
 * A structured-data block for search engines.
 *
 * Rendered in the body rather than the head: search engines read JSON-LD
 * anywhere in the document, and the body is the part these pages own —
 * the head belongs to `usePageMeta` and to the prerender script. The
 * serialised JSON escapes `<`, so a `</script>` inside an answer cannot end
 * the block early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
