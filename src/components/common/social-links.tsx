import type { ReactNode } from 'react'

/** One channel the trainer posts to. */
export interface SocialLink {
  /** The platform's own name; it is a brand, so it is not translated. */
  network: string
  /** The account's public page. */
  href: string
  /** The platform's mark, drawn in `currentColor` on a 24Ã—24 grid. */
  icon: ReactNode
}

/**
 * The channels, in the order the videos go out. lucide no longer ships brand
 * marks, so these are drawn here: YouTube, X and Facebook from their published
 * logo shapes, Instagram as its outline glyph.
 */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    network: 'YouTube',
    href: 'https://www.youtube.com/@BJ_Training',
    icon: (
      <path
        fill="currentColor"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
      />
    ),
  },
  {
    network: 'X',
    href: 'https://x.com/BJ_Training',
    icon: (
      <path
        fill="currentColor"
        d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
      />
    ),
  },
  {
    network: 'Instagram',
    href: 'https://www.instagram.com/blackjacktrainer_official/',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="5.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="17.6" cy="6.4" r="0.6" fill="currentColor" />
      </g>
    ),
  },
  {
    network: 'Facebook',
    href: 'https://www.facebook.com/profile.php?id=61594609505224',
    icon: (
      <path
        fill="currentColor"
        d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
      />
    ),
  },
]