<template>
  <div class="lnl-detail-chart-skeleton" role="status" aria-label="图表正在加载">
    <div class="lnl-detail-chart-skeleton-tabs" aria-hidden="true">
      <span v-for="index in 5" :key="index" />
    </div>
    <div class="lnl-detail-chart-skeleton-grid" aria-hidden="true">
      <span v-for="index in 5" :key="index" />
    </div>
  </div>
</template>

<style scoped>
.lnl-detail-chart-skeleton {
  min-height: 432px;
  padding: 0.25rem 0;
}

.lnl-detail-chart-skeleton[data-kind='ping'] {
  min-height: 520px;
}

.lnl-detail-chart-skeleton-tabs {
  display: flex;
  gap: 0.35rem;
  height: 2rem;
  align-items: center;
}

.lnl-detail-chart-skeleton-tabs span {
  width: 3.25rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  background: color-mix(in srgb, var(--foreground) 4%, transparent);
}

.lnl-detail-chart-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.lnl-detail-chart-skeleton-grid span {
  min-height: 11.75rem;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: var(--radius-md);
  background:
    linear-gradient(
      100deg,
      transparent 20%,
      color-mix(in srgb, var(--foreground) 3%, transparent) 50%,
      transparent 80%
    ),
    color-mix(in srgb, var(--card) 76%, transparent);
  background-size: 220% 100%;
  animation: lnl-chart-skeleton 1.4s ease-in-out infinite;
}

.lnl-detail-chart-skeleton-grid span:last-child {
  grid-column: span 2;
}

@keyframes lnl-chart-skeleton {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: -100% 0;
  }
}

@media (max-width: 1279px) {
  .lnl-detail-chart-skeleton-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lnl-detail-chart-skeleton-grid span:last-child {
    grid-column: auto;
  }
}

@media (max-width: 767px) {
  .lnl-detail-chart-skeleton,
  .lnl-detail-chart-skeleton[data-kind='ping'] {
    min-height: 360px;
  }

  .lnl-detail-chart-skeleton-grid {
    grid-template-columns: 1fr;
  }

  .lnl-detail-chart-skeleton-grid span:nth-child(n + 3) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lnl-detail-chart-skeleton-grid span {
    animation: none;
  }
}
</style>
