// Loads environment variables and builds a config object for SDK demos
require('dotenv').config();

function loadApiConfig(){
  const required = ['CORE_V4','REFERRAL_V4','WNATIVE_V4','RPC_URL'];
  required.forEach(k=>{ if(!process.env[k]) console.warn('[api/config] Missing env', k); });
  return {
    network: process.env.NETWORK||'bscTestnet',
    rpcUrl: process.env.RPC_URL,
    coreAddress: process.env.CORE_V4,
    referralAddress: process.env.REFERRAL_V4,
    feeManagerAddress: process.env.FEE_V4,
    wNative: process.env.WNATIVE_V4,
    router: process.env.ROUTER_TESTNET || process.env.ROUTER_MAINNET,
    ctkToken: process.env.CTK_TOKEN,
    referrer: process.env.REFERRER,
    referrerPk: process.env.REFERRER_PRIVATE_KEY,
    claimPercent: process.env.CLAIM_PERCENT ? parseInt(process.env.CLAIM_PERCENT,10):0,
    claimTokenOut: process.env.CLAIM_TOKEN_OUT,
    tierRulesJson: process.env.TIER_RULES_JSON
  };
}

module.exports = { loadApiConfig };
