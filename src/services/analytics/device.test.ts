import { describe, it, expect } from 'vitest'
import { deviceCategory } from './device'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1'
const IPAD_NEW = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

describe('deviceCategory', () => {
  it('phones', () => {
    expect(deviceCategory(IPHONE)).toBe('mobile')
    expect(deviceCategory(ANDROID_PHONE)).toBe('mobile')
  })

  it('tablets, including an iPad that claims to be a Mac', () => {
    expect(deviceCategory(ANDROID_TABLET)).toBe('tablet')
    expect(deviceCategory(IPAD_OLD)).toBe('tablet')
    expect(deviceCategory(IPAD_NEW, 5)).toBe('tablet')
  })

  it('desktops, including a real Mac', () => {
    expect(deviceCategory(WINDOWS)).toBe('desktop')
    expect(deviceCategory(IPAD_NEW, 0)).toBe('desktop')
    expect(deviceCategory('')).toBe('desktop')
  })
})
