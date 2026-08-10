export interface VisitorClientData {
  device: string
  browser: string
}

const ANDROID_REGEX = /android/i
const MOBILE_REGEX = /mobile/i
const IPHONE_OR_IPOD_REGEX = /iphone|ipod/i
const IPAD_REGEX = /ipad/i
const IPADOS_DESKTOP_REGEX = /macintosh/i
const TABLET_REGEX = /tablet/i
const EDGE_REGEX = /Edg(?:A|iOS)?\//i
const OPERA_REGEX = /OPR\/|OPiOS\//i
const CHROME_REGEX = /Chrome\/|CriOS\//i
const FIREFOX_REGEX = /Firefox\/|FxiOS\//i
const SAMSUNG_INTERNET_REGEX = /SamsungBrowser\//i
const SAFARI_REGEX = /Safari\//i

export function detectVisitorClient(
  userAgent: string,
  maxTouchPoints = 0,
): VisitorClientData {
  const isIpad = IPAD_REGEX.test(userAgent)
    || (IPADOS_DESKTOP_REGEX.test(userAgent) && maxTouchPoints > 1)

  let device = '桌面设备'
  if (isIpad)
    device = 'iPad'
  else if (IPHONE_OR_IPOD_REGEX.test(userAgent))
    device = 'iPhone'
  else if (ANDROID_REGEX.test(userAgent))
    device = MOBILE_REGEX.test(userAgent) ? 'Android 手机' : 'Android 平板'
  else if (TABLET_REGEX.test(userAgent))
    device = '平板电脑'

  let browser = '未知浏览器'
  if (EDGE_REGEX.test(userAgent))
    browser = 'Edge'
  else if (OPERA_REGEX.test(userAgent))
    browser = 'Opera'
  else if (SAMSUNG_INTERNET_REGEX.test(userAgent))
    browser = 'Samsung Internet'
  else if (CHROME_REGEX.test(userAgent))
    browser = 'Chrome'
  else if (FIREFOX_REGEX.test(userAgent))
    browser = 'Firefox'
  else if (SAFARI_REGEX.test(userAgent))
    browser = 'Safari'

  return { device, browser }
}
