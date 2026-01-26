/**
 * Format a USD value for display
 */
export function formatUsd(value: number | null | undefined, options?: { compact?: boolean }): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (options?.compact) {
    return formatCompactUsd(value);
  }

  if (Math.abs(value) < 0.01 && value !== 0) {
    return `$${value.toFixed(6)}`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a large USD value compactly (e.g., $1.2B, $500M, $12.5K)
 */
export function formatCompactUsd(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000_000) {
    return `${sign}$${(absValue / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (absValue >= 1_000_000_000) {
    return `${sign}$${(absValue / 1_000_000_000).toFixed(2)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(2)}K`;
  }

  return `${sign}$${absValue.toFixed(2)}`;
}

/**
 * Format a percentage value for display
 */
export function formatPercent(value: number | null | undefined, options?: { showSign?: boolean }): string {
  if (value === null || value === undefined) {
    return '-';
  }

  const sign = options?.showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format a token amount for display
 */
export function formatTokenAmount(amount: number, options?: { decimals?: number; compact?: boolean }): string {
  const decimals = options?.decimals ?? 4;

  if (options?.compact) {
    return formatCompactNumber(amount);
  }

  if (amount === 0) {
    return '0';
  }

  if (Math.abs(amount) < 0.0001) {
    return amount.toExponential(2);
  }

  if (Math.abs(amount) >= 1_000_000) {
    return formatCompactNumber(amount);
  }

  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a large number compactly (e.g., 1.2B, 500M, 12.5K)
 */
export function formatCompactNumber(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(2)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(2)}K`;
  }

  return `${sign}${absValue.toFixed(2)}`;
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp: number, options?: { includeTime?: boolean }): string {
  const date = new Date(timestamp * 1000);

  if (options?.includeTime) {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return formatTimestamp(timestamp);
  }
  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'just now';
}

/**
 * Format chain name for display
 */
export function formatChainName(chain: string): string {
  const chainNames: Record<string, string> = {
    // DeBank chain identifiers
    eth: 'Ethereum',
    bsc: 'BNB Chain',
    polygon: 'Polygon',
    arb: 'Arbitrum',
    op: 'Optimism',
    avax: 'Avalanche',
    base: 'Base',
    zksync: 'zkSync Era',
    linea: 'Linea',
    scroll: 'Scroll',
    blast: 'Blast',
    mantle: 'Mantle',
    manta: 'Manta',
    mode: 'Mode',
    gnosis: 'Gnosis',
    fantom: 'Fantom',
    celo: 'Celo',
    aurora: 'Aurora',
    moonbeam: 'Moonbeam',
    moonriver: 'Moonriver',
    cronos: 'Cronos',
    harmony: 'Harmony',
    metis: 'Metis',
    boba: 'Boba',
    kcc: 'KCC',
    okc: 'OKC',
    heco: 'HECO',
    solana: 'Solana',
    // Etherscan chain identifiers
    ethereum: 'Ethereum',
    arbitrum: 'Arbitrum',
    optimism: 'Optimism',
    avalanche: 'Avalanche',
  };

  return chainNames[chain] ?? chain.toUpperCase();
}
