#!/usr/bin/env node
// Demo: Swap BNB -> CTK con referral
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, swapETHForToken, determineRequestedTier } = require('..');
const { loadApiConfig } = require('../config');

function parseRules(str){ try { return JSON.parse(str||'[]'); } catch { return []; } }

async function main(){
  const cfg = loadApiConfig();
  const pk = process.env.DEMO_PRIVATE_KEY; if(!pk) throw new Error('DEMO_PRIVATE_KEY faltante');
  if(!cfg.referrer) throw new Error('REFERRER faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const { core } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });
  const amountIn = ethers.parseEther(process.env.DEMO_BUY_AMOUNT || '0.01');
  const requestedTier = determineRequestedTier(0n, parseRules(cfg.tierRulesJson));
  console.log('requestedTier', requestedTier);
  const receipt = await swapETHForToken({ core, tokenOut: cfg.ctkToken, amountInWei: amountIn, referralModelId:2, referrer: cfg.referrer, requestedTier });
  console.log('Swap referral tx:', receipt.transactionHash);
}
main().catch(e=>{ console.error(e); process.exit(1); });
