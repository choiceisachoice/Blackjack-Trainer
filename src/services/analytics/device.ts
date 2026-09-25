/** The three classes the report groups by. Nothing finer is stored. */
export type DeviceCategory = 'mobile' | 'tablet' | 'desktop'

/**
 * Classify the device from the user agent, coarsely.
 *
 * Only the class leaves the browser — never the user agent string itself.
 * Tablets are told apart from phones by the words vendors put there for the
 * purpose (`iPad`, `Tablet`) and, for iPadOS 13+ which claims to be a Mac,
 * by a Mac with touch points. Everything unrecognised is a desktop, which is
 * also the honest default: a class that cannot be read is not guessed.
 *
 * @param ua - `navigator.userAgent`
 * @param touchPoints - `navigator.maxTouchPoints`, for the iPad case
 */
export function deviceCategory(ua: string, touchPoints = 0): DeviceCategory {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet'
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet'
  if (/Macintosh/i.test(ua) && touchPoints > 1) return 'tablet'
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile'
  return 'desktop'
}
