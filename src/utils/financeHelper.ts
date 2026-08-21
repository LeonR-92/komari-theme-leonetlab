import type { BillingCycleType } from './tagHelper.ts'
import type { BillingDisplayPeriod } from '@/stores/app'
import type { NodeData } from '@/stores/nodes'
import { getBillingCycleText, parseBillingCycleType } from './tagHelper.ts'

const FINANCE_CURRENCY_CONFIG = {
  AUD: { rate: 0.20941, symbol: 'A$' },
  BRL: { rate: 0.74734, symbol: 'R$' },
  CAD: { rate: 0.20691, symbol: 'C$' },
  CHF: { rate: 0.11746, symbol: 'CHF' },
  CNY: { rate: 1, symbol: '¥' },
  CZK: { rate: 3.0787, symbol: 'Kč' },
  DKK: { rate: 0.95296, symbol: 'kr' },
  EUR: { rate: 0.1275, symbol: '€' },
  GBP: { rate: 0.11027, symbol: '£' },
  HKD: { rate: 1.1594, symbol: '$' },
  HUF: { rate: 44.688, symbol: 'Ft' },
  IDR: { rate: 2622.37, symbol: 'Rp' },
  ILS: { rate: 0.43085, symbol: '₪' },
  INR: { rate: 14.0178, symbol: '₹' },
  ISK: { rate: 18.4626, symbol: 'kr' },
  JPY: { rate: 23.707, symbol: '¥' },
  KRW: { rate: 224.11, symbol: '₩' },
  MXN: { rate: 2.5472, symbol: 'Mex$' },
  MYR: { rate: 0.59945, symbol: 'RM' },
  NOK: { rate: 1.4096, symbol: 'kr' },
  NZD: { rate: 0.2535, symbol: 'NZ$' },
  PHP: { rate: 8.9288, symbol: '₱' },
  PLN: { rate: 0.54138, symbol: 'zł' },
  RON: { rate: 0.66769, symbol: 'lei' },
  SEK: { rate: 1.3895, symbol: 'kr' },
  SGD: { rate: 0.18975, symbol: 'S$' },
  THB: { rate: 4.8172, symbol: '฿' },
  TRY: { rate: 6.849, symbol: '₺' },
  USD: { rate: 0.14799, symbol: '$' },
  ZAR: { rate: 2.3995, symbol: 'R' },
} as const

export type CurrencyCode = keyof typeof FINANCE_CURRENCY_CONFIG
export const SUPPORTED_FINANCE_CURRENCIES = Object.keys(FINANCE_CURRENCY_CONFIG) as CurrencyCode[]
export const DISPLAY_FINANCE_CURRENCIES = ['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY'] as const satisfies readonly CurrencyCode[]
export type ExchangeRates = Record<CurrencyCode, number>
export type ExchangeRateSource = 'cache' | 'network' | 'stale-cache' | 'default'
interface ExchangeRateResult { rates: ExchangeRates, source: ExchangeRateSource }

interface ExchangeRatesCache {
  base: 'CNY'
  date: string
  fetchedAt: number
  rates: Partial<Record<CurrencyCode, number>>
}

const CACHE_KEY = 'komari_finance_exchange_rates_cny_v1'
const MONTH_DAYS = 30
let pendingExchangeRateRequest: Promise<ExchangeRateResult> | null = null
let resolvedExchangeRateResult: ExchangeRateResult | null = null

export const DEFAULT_EXCHANGE_RATES = Object.fromEntries(
  Object.entries(FINANCE_CURRENCY_CONFIG).map(([currency, config]) => [currency, config.rate]),
) as ExchangeRates

export const CURRENCY_SYMBOLS = Object.fromEntries(
  Object.entries(FINANCE_CURRENCY_CONFIG).map(([currency, config]) => [currency, config.symbol]),
) as Record<CurrencyCode, string>

export const COMPACT_CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  ...CURRENCY_SYMBOLS,
  CNY: '¥',
  JPY: 'JP¥',
  HKD: 'HK$',
  USD: '$',
  CAD: 'C$',
  AUD: 'A$',
  SGD: 'S$',
}

export const BILLING_PERIOD_LABELS: Record<BillingDisplayPeriod, string> = {
  monthly: '月付',
  quarterly: '季付',
  yearly: '年付',
}
const BILLING_PERIOD_MONTHS: Record<BillingDisplayPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}
const BILLING_PERIOD_DAYS: Record<BillingDisplayPeriod, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
}
const BILLING_CYCLE_MONTHS: Partial<Record<BillingCycleType, number>> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
  biennial: 24,
  triennial: 36,
  quinquennial: 60,
}

const EXCHANGE_RATE_APIS = [
  {
    url: 'https://open.er-api.com/v6/latest/CNY',
    parse: (data: unknown) => (data as { rates?: unknown }).rates,
  },
  {
    url: 'https://api.frankfurter.app/latest?from=CNY',
    parse: (data: unknown) => (data as { rates?: unknown }).rates,
  },
] as const
const EXPLICIT_CURRENCY_ALIASES: Record<string, CurrencyCode> = {
  '$': 'USD',
  'US$': 'USD',
  'CA$': 'CAD',
  'CN¥': 'CNY',
  'RMB': 'CNY',
  'HK$': 'HKD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'CNY',
  '￥': 'CNY',
  'JP¥': 'JPY',
}
const CURRENCY_SYMBOL_ALIASES = createCurrencySymbolAliases()

export function normalizeCurrency(currency: string | null | undefined): CurrencyCode {
  return resolveCurrency(currency) ?? 'CNY'
}

export function isSupportedCurrency(currency: string): currency is CurrencyCode {
  return (SUPPORTED_FINANCE_CURRENCIES as readonly string[]).includes(currency)
}

function createCurrencySymbolAliases(): Record<string, CurrencyCode> {
  const symbolEntries = Object.entries(FINANCE_CURRENCY_CONFIG).map(([currency, config]) => [
    config.symbol.trim().toUpperCase(),
    currency as CurrencyCode,
  ] as const)

  const symbolCounts = symbolEntries.reduce<Record<string, number>>((counts, [symbol]) => {
    counts[symbol] = (counts[symbol] || 0) + 1
    return counts
  }, {})

  return symbolEntries.reduce<Record<string, CurrencyCode>>((aliases, [symbol, currency]) => {
    if (symbol && symbolCounts[symbol] === 1)
      aliases[symbol] = currency

    return aliases
  }, {})
}

export function resolveCurrency(currency: string | null | undefined): CurrencyCode | null {
  const value = String(currency ?? '').trim().toUpperCase()
  if (!value)
    return 'CNY'
  if (isSupportedCurrency(value))
    return value
  return EXPLICIT_CURRENCY_ALIASES[value] || CURRENCY_SYMBOL_ALIASES[value] || null
}

function isComplimentaryNode(node: NodeData): boolean {
  return String(node.tags ?? '')
    .split(';')
    .some(tag => tag.trim().includes('白嫖'))
}

export function getTodayDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function shouldExcludeFreeNodes(): boolean {
  const value = getLocalStorageItem('fin_exclude_free')
  return value === null ? true : value === 'true'
}

export function getStoredFinanceCurrency(): CurrencyCode {
  return normalizeCurrency(getLocalStorageItem('fin_currency') || 'CNY')
}

export function setStoredFinanceCurrency(currency: CurrencyCode): void {
  setLocalStorageItem('fin_currency', currency)
}

export function calculateTotalValueCNY(
  nodes: NodeData[],
  exchangeRates: ExchangeRates,
  excludeFreeTags = true,
): number {
  return nodes.reduce((sum, node) => {
    if (excludeFreeTags && isComplimentaryNode(node))
      return sum

    return sum + getPriceCNY(node, exchangeRates)
  }, 0)
}

export function calculateValueCNY(
  node: NodeData,
  exchangeRates: ExchangeRates,
): number {
  return getPriceCNY(node, exchangeRates)
}

export function calculateTotalMonthlyAverageCostCNY(
  nodes: NodeData[],
  exchangeRates: ExchangeRates,
  excludeFreeTags = true,
): number {
  return nodes.reduce((sum, node) => {
    if (excludeFreeTags && isComplimentaryNode(node))
      return sum

    return sum + calculateMonthlyAverageCostCNY(node, exchangeRates)
  }, 0)
}

export function calculateMonthlyAverageCostCNY(
  node: NodeData,
  exchangeRates: ExchangeRates,
): number {
  const priceCNY = getPriceCNY(node, exchangeRates)
  if (priceCNY <= 0)
    return 0

  const billingCycle = Number(node.billing_cycle)
  if (!Number.isFinite(billingCycle) || billingCycle <= 0)
    return 0

  return priceCNY / billingCycle * MONTH_DAYS
}

export function calculateTotalDailyCostCNY(
  nodes: NodeData[],
  exchangeRates: ExchangeRates,
  excludeFreeTags = true,
): number {
  return nodes.reduce((sum, node) => {
    if (excludeFreeTags && isComplimentaryNode(node))
      return sum

    return sum + calculateDailyCostCNY(node, exchangeRates)
  }, 0)
}

export function calculateDailyCostCNY(
  node: NodeData,
  exchangeRates: ExchangeRates,
): number {
  const priceCNY = getPriceCNY(node, exchangeRates)
  if (priceCNY <= 0)
    return 0

  const billingCycle = Number(node.billing_cycle)
  if (!Number.isFinite(billingCycle) || billingCycle <= 0)
    return 0

  return priceCNY / billingCycle
}

export function formatFinanceAmount(amount: number, currency: CurrencyCode): {
  currency: CurrencyCode
  symbol: string
  value: string
} {
  const safeAmount = Number.isFinite(amount) ? amount : 0
  const value = new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Math.abs(safeAmount) < 100000 ? 2 : 0,
    notation: Math.abs(safeAmount) >= 100000 ? 'compact' : 'standard',
  }).format(safeAmount)

  return {
    currency,
    symbol: CURRENCY_SYMBOLS[currency],
    value,
  }
}

export interface RecurringCostDisplay {
  text: string
  exactText: string
  currency: string
  amount: number | null
  sourceExactText: string
  sourceCycleText: string
  referenceText: string | null
  estimated: boolean
  derived: boolean
  oneTime: boolean
  billingCycle: number | null
  state: 'paid' | 'free' | 'missing' | 'invalid'
}

export function formatNodeMonthlyCost(
  node: Pick<NodeData, 'price' | 'billing_cycle' | 'currency'>,
  targetCurrency: CurrencyCode,
  exchangeRates: ExchangeRates,
  allowConversion = true,
): RecurringCostDisplay {
  return formatNodeRecurringCost(node, targetCurrency, exchangeRates, 'monthly', allowConversion)
}

export function formatNodeRecurringCost(
  node: Pick<NodeData, 'price' | 'billing_cycle' | 'currency'>,
  targetCurrency: CurrencyCode,
  exchangeRates: ExchangeRates,
  period: BillingDisplayPeriod,
  allowConversion = true,
): RecurringCostDisplay {
  const price = Number(node.price)
  if (price === -1)
    return createEmptyRecurringCost('免费', 'free')
  if (!Number.isFinite(price) || price === 0)
    return createEmptyRecurringCost('未填写', 'missing')

  const billingCycle = Number(node.billing_cycle)
  if (price < 0 || !Number.isFinite(billingCycle) || billingCycle === 0 || billingCycle < -1)
    return createEmptyRecurringCost('—', 'invalid')

  const cycleType = parseBillingCycleType(billingCycle)
  const oneTime = cycleType === 'once'
  const sourceMonths = BILLING_CYCLE_MONTHS[cycleType]
  const targetMonths = BILLING_PERIOD_MONTHS[period]
  const targetDays = BILLING_PERIOD_DAYS[period]
  const estimated = cycleType === 'custom'
  const derived = oneTime
    ? false
    : sourceMonths
      ? sourceMonths !== targetMonths
      : billingCycle !== targetDays
  const sourceAmount = oneTime
    ? price
    : sourceMonths
      ? price * targetMonths / sourceMonths
      : price * targetDays / billingCycle
  const sourceCurrency = resolveCurrency(node.currency)
  const rawCurrency = String(node.currency || '').trim().toUpperCase() || 'CNY'
  const sourceCurrencyText = sourceCurrency ?? rawCurrency
  const sourceExactText = `${formatExactMoney(price)} ${sourceCurrencyText}`
  const sourceCycleText = getBillingCycleText(billingCycle, 'zh-CN')
  const common = {
    sourceExactText,
    sourceCycleText,
    estimated,
    derived,
    oneTime,
    billingCycle,
    state: 'paid' as const,
  }

  if (!sourceCurrency) {
    return {
      text: `${rawCurrency} ${formatCompactMoney(sourceAmount)}`,
      exactText: `${formatExactMoney(sourceAmount)} ${rawCurrency}`,
      currency: rawCurrency,
      amount: sourceAmount,
      referenceText: null,
      ...common,
    }
  }

  const referenceText = formatReferenceAmount(
    sourceAmount,
    sourceCurrency,
    targetCurrency,
    exchangeRates,
    allowConversion,
  )
  return {
    text: `${COMPACT_CURRENCY_SYMBOLS[sourceCurrency]}${formatCompactMoney(sourceAmount)}`,
    exactText: `${formatExactMoney(sourceAmount)} ${sourceCurrency}`,
    currency: sourceCurrency,
    amount: sourceAmount,
    referenceText,
    ...common,
  }
}

export function formatRecurringCostTooltip(
  display: RecurringCostDisplay,
  period: BillingDisplayPeriod,
): string {
  if (display.state === 'free')
    return '该节点标记为免费'
  if (display.state === 'missing')
    return '请在 Komari 后台填写价格与计费周期'
  if (display.state === 'invalid')
    return '计费周期无效，无法推算费用'

  const reference = display.referenceText ? ` · 参考换算约 ${display.referenceText}` : ''
  if (display.oneTime)
    return `一次性 ${display.sourceExactText} · 后台原值${reference}`

  const selected = `${BILLING_PERIOD_LABELS[period]} ${display.exactText}`
  const source = `${display.sourceExactText} / ${display.sourceCycleText}（${display.billingCycle} 天）`
  if (!display.derived)
    return `${selected} · 后台原值 ${source}${reference}`

  const estimate = display.estimated ? '按自定义天数估算' : '按后台付款周期推算'
  return `${selected} · ${estimate}，基准 ${source}${reference}`
}

function createEmptyRecurringCost(
  text: string,
  state: Exclude<RecurringCostDisplay['state'], 'paid'>,
): RecurringCostDisplay {
  return {
    text,
    exactText: text === '—' ? '计费周期无效' : text,
    currency: '',
    amount: null,
    sourceExactText: '',
    sourceCycleText: '',
    referenceText: null,
    estimated: false,
    derived: false,
    oneTime: false,
    billingCycle: null,
    state,
  }
}

function formatReferenceAmount(
  sourceAmount: number,
  sourceCurrency: CurrencyCode,
  targetCurrency: CurrencyCode,
  exchangeRates: ExchangeRates,
  allowConversion: boolean,
): string | null {
  if (!allowConversion || sourceCurrency === targetCurrency)
    return null

  const sourceRate = Number(exchangeRates[sourceCurrency])
  const targetRate = Number(exchangeRates[targetCurrency])
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0)
    return null

  const converted = sourceAmount / sourceRate * targetRate
  return `${COMPACT_CURRENCY_SYMBOLS[targetCurrency]}${formatExactMoney(converted)} ${targetCurrency}`
}

function formatCompactMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.abs(amount) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(amount) < 100 ? 2 : Math.abs(amount) < 1000 ? 1 : 0,
    notation: Math.abs(amount) >= 100000 ? 'compact' : 'standard',
    compactDisplay: 'short',
    useGrouping: Math.abs(amount) < 100000,
  }).format(amount)
}

function formatExactMoney(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    useGrouping: true,
  }).format(amount)
}

export async function getDailyExchangeRates(): Promise<ExchangeRateResult> {
  if (resolvedExchangeRateResult)
    return resolvedExchangeRateResult
  if (pendingExchangeRateRequest)
    return pendingExchangeRateRequest

  pendingExchangeRateRequest = loadDailyExchangeRates()
  try {
    resolvedExchangeRateResult = await pendingExchangeRateRequest
    return resolvedExchangeRateResult
  }
  finally {
    pendingExchangeRateRequest = null
  }
}

async function loadDailyExchangeRates(): Promise<ExchangeRateResult> {
  const today = getTodayDateKey()
  const cached = readCachedExchangeRates()

  if (cached && cached.date === today) {
    return {
      rates: cached.rates,
      source: 'cache',
    }
  }

  const fetchedRates = await fetchExchangeRates()
  if (fetchedRates) {
    writeCachedExchangeRates(fetchedRates, today)
    return {
      rates: fetchedRates,
      source: 'network',
    }
  }

  if (cached) {
    return {
      rates: cached.rates,
      source: 'stale-cache',
    }
  }

  return {
    rates: DEFAULT_EXCHANGE_RATES,
    source: 'default',
  }
}

function getPriceCNY(node: NodeData, exchangeRates: ExchangeRates): number {
  const price = Number(node.price)
  if (!Number.isFinite(price) || price <= 0)
    return 0

  const currency = resolveCurrency(node.currency)
  if (!currency)
    return 0
  if (currency === 'CNY')
    return price

  const rate = Number(exchangeRates[currency])
  if (!Number.isFinite(rate) || rate <= 0)
    return 0

  return price / rate
}

async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  for (const api of EXCHANGE_RATE_APIS) {
    try {
      const response = await fetchWithTimeout(api.url)
      if (!response.ok)
        continue

      const data = await response.json()
      const rates = sanitizeExchangeRates(api.parse(data))
      if (rates)
        return rates
    }
    catch (error) {
      console.warn(`获取汇率失败: ${api.url}`, error)
    }
  }

  return null
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  }
  finally {
    window.clearTimeout(timeoutId)
  }
}

function readCachedExchangeRates(): { date: string, rates: ExchangeRates } | null {
  try {
    const rawValue = getLocalStorageItem(CACHE_KEY)
    if (!rawValue)
      return null

    const cache = JSON.parse(rawValue) as ExchangeRatesCache
    const rates = sanitizeExchangeRates(cache.rates)
    if (cache.base !== 'CNY' || !cache.date || !rates)
      return null

    return {
      date: cache.date,
      rates,
    }
  }
  catch {
    return null
  }
}

function writeCachedExchangeRates(rates: ExchangeRates, date: string): void {
  const cache: ExchangeRatesCache = {
    base: 'CNY',
    date,
    fetchedAt: Date.now(),
    rates,
  }
  setLocalStorageItem(CACHE_KEY, JSON.stringify(cache))
}

function sanitizeExchangeRates(rates: unknown): ExchangeRates | null {
  if (!rates || typeof rates !== 'object')
    return null

  const record = rates as Record<string, unknown>
  const result = { CNY: 1 } as ExchangeRates

  for (const currency of SUPPORTED_FINANCE_CURRENCIES) {
    if (currency === 'CNY')
      continue

    const value = Number(record[currency])
    if (!Number.isFinite(value) || value <= 0)
      return null

    result[currency] = value
  }

  return result
}

function getLocalStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function setLocalStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  }
  catch {
    // 缓存失败不应阻断价值计算，下一次刷新会重新尝试获取汇率。
  }
}
