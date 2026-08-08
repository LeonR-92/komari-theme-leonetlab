import type { ExchangeRates } from '@/utils/financeHelper'
import { readonly, ref } from 'vue'
import { DEFAULT_EXCHANGE_RATES, getDailyExchangeRates } from '@/utils/financeHelper'

const rates = ref<ExchangeRates>(DEFAULT_EXCHANGE_RATES)
const loaded = ref(false)
const conversionAvailable = ref(false)
let pending: Promise<void> | null = null

async function ensureFinanceRates(): Promise<void> {
  if (loaded.value)
    return
  if (pending)
    return pending

  pending = getDailyExchangeRates()
    .then((result) => {
      rates.value = result.rates
      conversionAvailable.value = result.source !== 'default'
      loaded.value = true
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function useFinanceRates() {
  return {
    rates: readonly(rates),
    loaded: readonly(loaded),
    conversionAvailable: readonly(conversionAvailable),
    ensureFinanceRates,
  }
}
