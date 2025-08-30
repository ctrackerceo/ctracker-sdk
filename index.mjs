// ES Module wrapper for C-Tracker SDK v1.0.5
// This file provides ES module compatibility WITHOUT modifying the original CommonJS API
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the original CommonJS API
const cTrackerSDK = require('./index.js');

// Re-export all functions as ES modules while preserving the original API
export const {
  // Core functions
  initContracts,
  quoteBest,
  swapETHForToken,
  swapETHForTokenChain,
  swapTokenForETH,
  swapTokenForToken,
  swapETHForTokenPath,
  swapTokenForTokenPath,
  quoteBuy,
  quoteSell,
  quoteTokenForToken,
  
  // High-level wrapper functions
  getBestQuote,
  executeSwap,
  getQuoteNativeToToken,
  getQuoteTokenToNative,
  getQuoteTokenToToken,
  executeSwapNativeToToken,
  executeSwapTokenToNative,
  executeSwapTokenToToken,
  executeSwapNativeToTokenPath,
  executeSwapTokenToTokenPath,
  executeSwapNativeToTokenChain,
  
  // Referral functions
  getReferralSnapshot,
  getPending,
  hasClaimable,
  getClaimableAmount,
  claimNative,
  claimToken,
  claimPath,
  getPendingReferral,
  claimReferralNative,
  claimReferralToken,
  claimReferralPercentage,
  
  // Utility functions
  validateReferralInputs,
  validateClaimToken,
  validateClaimPath,
  calcDeadline,
  applySlippage,
  parseConfig,
  parseTierRules,
  getGlobalLeftover,
  getModelLeftover,
  
  // Constants
  DEFAULT_DEADLINE_SECS,
  MAINNET_CORE_CURRENT
} = cTrackerSDK;

// Export default for convenience
export default cTrackerSDK;

// Special function to ensure SDK is ready for ES module usage
export async function ensureSdkReady() {
  try {
    if (typeof cTrackerSDK.initContracts === 'function') {
      console.log('✅ [SDK ES] initContracts available');
      return true;
    }
    throw new Error('initContracts not available in SDK');
  } catch (error) {
    console.error('❌ [SDK ES] Error ensuring SDK ready:', error);
    return false;
  }
}
