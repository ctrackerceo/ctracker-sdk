import { determineRequestedTier, applySlippage } from '../index';

// Example volume-based tier selection
const volume = 12_500n * 10n**18n; // 12.5k tokens
const rules = [
  { minVolume: 0n, tier: 0 },
  { minVolume: 5_000n * 10n**18n, tier: 1 },
  { minVolume: 10_000n * 10n**18n, tier: 2 },
  { minVolume: 50_000n * 10n**18n, tier: 3 }
];
const t = determineRequestedTier(volume, rules);
// Slippage helper demo
const minOut = applySlippage(1_000_000n, 500); // 5% slippage
console.log('tier', t, 'minOut', minOut);
