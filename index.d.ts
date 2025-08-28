import { ethers } from 'ethers';

// ------------------------
// Config / Initialization
// ------------------------
export interface InitConfig {
  coreAddress: string;
  referralAddress: string;
  feeManagerAddress?: string;
  // wNative must be provided explicitly (Core ABI no longer exposes wNative())
  wNative?: string; // optional here for backward config objects, but helpers will throw if absent when required
  provider: ethers.Provider;
  signer?: ethers.Signer;
}

export interface Contracts {
  core: ethers.Contract;
  referral: ethers.Contract;
}

export function initContracts(cfg: InitConfig): Contracts;

// ------------------------
// Quote
// ------------------------
export interface QuoteBestResult {
  router: string;
  path: string[];
  amountOut: bigint;
}
export function quoteBest(core: ethers.Contract, amountInWei: bigint, tokenIn: string, tokenOut: string): Promise<QuoteBestResult>;

// ------------------------
// Swap Helpers
// ------------------------
export interface SwapETHForTokenArgs {
  core: ethers.Contract;
  tokenOut: string;
  amountInWei: bigint;
  wNative: string; // required >=1.1.0
  slippageBps?: number; // default 800 (8%)
  referralModelId?: number;
  referrer?: string;
  requestedTier?: number; // VIP / premium fee tier
  recipient?: string;
}
export function swapETHForToken(args: SwapETHForTokenArgs): Promise<ethers.TransactionReceipt>;

export interface SwapETHForTokenChainArgs {
  core: ethers.Contract;
  tokenOut: string;
  amountInWei: bigint;
  refChain: [string,string,string]; // explicit referral chain (use zeros if missing levels)
  wNative: string; // required >=1.1.0
  slippageBps?: number;
  referralModelId?: number; // normally 2
  requestedTier?: number;
  recipient?: string;
}
export function swapETHForTokenChain(args: SwapETHForTokenChainArgs): Promise<ethers.TransactionReceipt>;

export interface SwapTokenForETHArgs {
  core: ethers.Contract;
  tokenIn: string;
  amountInWei: bigint;
  minOut?: bigint;
  referralModelId?: number;
  referrer?: string;
  requestedTier?: number;
  recipient?: string;
}
export function swapTokenForETH(args: SwapTokenForETHArgs): Promise<ethers.TransactionReceipt>;

export interface SwapTokenForTokenArgs {
  core: ethers.Contract;
  tokenIn: string;
  tokenOut: string;
  amountInWei: bigint;
  slippageBps?: number;
  referralModelId?: number;
  referrer?: string;
  requestedTier?: number;
  recipient?: string;
}
export function swapTokenForToken(args: SwapTokenForTokenArgs): Promise<ethers.TransactionReceipt>;

// Path swap helpers
export interface SwapETHForTokenPathArgs {
  core: ethers.Contract;
  path: string[]; // [WBNB, ..., tokenOut]
  amountInWei: bigint;
  expectedOut?: bigint | string; // quoted expected output
  minOut?: bigint; // overrides expectedOut/slippage if provided
  slippageBps?: number;
  referralModelId?: number;
  referrer?: string;
  requestedTier?: number;
  recipient?: string;
}
export function swapETHForTokenPath(args: SwapETHForTokenPathArgs): Promise<ethers.TransactionReceipt>;

export interface SwapTokenForTokenPathArgs {
  core: ethers.Contract;
  path: string[]; // [tokenIn, ..., tokenOut]
  amountInWei: bigint;
  expectedOut?: bigint | string;
  minOut?: bigint;
  slippageBps?: number;
  referralModelId?: number;
  referrer?: string;
  requestedTier?: number;
  recipient?: string;
}
export function swapTokenForTokenPath(args: SwapTokenForTokenPathArgs): Promise<ethers.TransactionReceipt>;

// ------------------------
// Referral Queries
// ------------------------
export function getReferralSnapshot(referral: ethers.Contract, user: string, feeManager?: string): Promise<[
  boolean, // claimable
  bigint,  // pending
  string,  // l1
  string,  // l2
  string,  // l3
  number,  // tier (uint8)
  bigint   // volume
]>;

export function getPending(referral: ethers.Contract, user: string): Promise<bigint>;
export function hasClaimable(referral: ethers.Contract, user: string, feeManager?: string): Promise<boolean>;
export function getClaimableAmount(referral: ethers.Contract, user: string): Promise<bigint>;

// ------------------------
// Claims
// ------------------------
export interface ClaimNativeArgs {
  referral: ethers.Contract;
  amount?: bigint; // 0 => full pending
  recipient?: string;
}
export function claimNative(args: ClaimNativeArgs): Promise<ethers.TransactionReceipt>;

export interface ClaimTokenArgs {
  referral: ethers.Contract;
  tokenOut: string;
  amount?: bigint;
  minOut?: bigint;
  recipient?: string;
  deadlineSecs?: number;
}
export function claimToken(args: ClaimTokenArgs): Promise<ethers.TransactionReceipt>;

export interface ClaimPathArgs {
  referral: ethers.Contract;
  path: string[];
  amount?: bigint;
  minOut?: bigint;
  recipient?: string;
  deadlineSecs?: number;
}
export function claimPath(args: ClaimPathArgs): Promise<ethers.TransactionReceipt>;

// ------------------------
// Validation Helpers
// ------------------------
export function validateReferralInputs(args: { referralModelId: number; referrer: string; }): void;
export function validateClaimToken(args: { tokenOut: string; minOut: bigint; }): void;
export function validateClaimPath(path: string[]): void;

// ------------------------
// Utils
// ------------------------
export function calcDeadline(secondsAhead?: number): number; // unix timestamp
export function applySlippage(amountOut: bigint, slippageBps: number): bigint;

// Leftover helpers
export function getGlobalLeftover(referral: ethers.Contract): Promise<bigint>;
export function getModelLeftover(referral: ethers.Contract, modelId: number): Promise<bigint>;

// Namespace export convenience (CJS default imported as object)
declare const _default: {
  initContracts: typeof initContracts;
  quoteBest: typeof quoteBest;
  swapETHForToken: typeof swapETHForToken;
  swapETHForTokenChain: typeof swapETHForTokenChain;
  swapTokenForETH: typeof swapTokenForETH;
  swapTokenForToken: typeof swapTokenForToken;
  swapETHForTokenPath: typeof swapETHForTokenPath;
  swapTokenForTokenPath: typeof swapTokenForTokenPath;
  getReferralSnapshot: typeof getReferralSnapshot;
  getPending: typeof getPending;
  hasClaimable: typeof hasClaimable;
  getClaimableAmount: typeof getClaimableAmount;
  claimNative: typeof claimNative;
  claimToken: typeof claimToken;
  claimPath: typeof claimPath;
  validateReferralInputs: typeof validateReferralInputs;
  validateClaimToken: typeof validateClaimToken;
  validateClaimPath: typeof validateClaimPath;
  calcDeadline: typeof calcDeadline;
  applySlippage: typeof applySlippage;
  getGlobalLeftover: typeof getGlobalLeftover;
  getModelLeftover: typeof getModelLeftover;
  determineRequestedTier: typeof determineRequestedTier;
  loadApiConfig: typeof loadApiConfig;
  claimPercentage: typeof claimPercentage;
  parseTierRules: typeof parseTierRules;
};
export default _default;

// ------------------------
// Tier Helper Types
// ------------------------
export interface TierRule { minVolume: bigint | string; tier: number; }
export function determineRequestedTier(volume: bigint | string, rules: TierRule[]): number;
export function claimPercentage(args: { referral: ethers.Contract; percentage: number; tokenOut?: string; path?: string[]; minOut?: bigint; recipient?: string; }): Promise<ethers.TransactionReceipt | { skipped: true; reason: string } >;
export function parseTierRules(str?: string): TierRule[];

// Config Loader
export interface ApiConfig {
  network: string;
  rpcUrl?: string;
  coreAddress?: string;
  referralAddress?: string;
  feeManagerAddress?: string;
  wNative?: string;
  router?: string;
  ctkToken?: string;
  referrer?: string;
  referrerPk?: string;
  claimPercent?: number;
  claimTokenOut?: string;
  tierRulesJson?: string;
}
export function loadApiConfig(): ApiConfig;
