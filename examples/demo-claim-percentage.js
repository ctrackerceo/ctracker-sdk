#!/usr/bin/env node
// Demo: Claim porcentaje (nativo, tokenOut o path)
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, getPending, claimPercentage, parseTierRules } = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  const pk = cfg.referrerPk; if(!pk) throw new Error('REFERRER_PRIVATE_KEY faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const { referral } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });

  const pending = await getPending(referral, wallet.address);
  console.log('Pending total:', pending.toString());
  if(pending === 0n){ console.log('Nada para claim'); return; }

  const pct = process.env.CLAIM_PERCENT || '50';
  const percentage = parseInt(pct,10);
  const mode = process.env.CLAIM_MODE || 'native'; // native | token | path

  let res;
  if(mode === 'token'){
    if(!cfg.claimTokenOut) throw new Error('Falta CLAIM_TOKEN_OUT para modo token');
    res = await claimPercentage({ referral, percentage, tokenOut: cfg.claimTokenOut, minOut: 0n });
  } else if(mode === 'path'){
    const rawPath = process.env.CLAIM_PATH; // coma separada
    if(!rawPath) throw new Error('Falta CLAIM_PATH para modo path');
    const path = rawPath.split(',').map(s=>s.trim());
    res = await claimPercentage({ referral, percentage, path, minOut: 0n });
  } else {
    res = await claimPercentage({ referral, percentage });
  }
  if(res && res.transactionHash){
    console.log(`Claim ${percentage}% tx:`, res.transactionHash);
  } else {
    console.log('Resultado:', res);
  }

  // Mostrar tier rules parseadas (opcional)
  if(cfg.tierRulesJson){
    const rules = parseTierRules(cfg.tierRulesJson);
    console.log('Tier rules:', rules);
  }
}
main().catch(e=>{ console.error(e); process.exit(1); });