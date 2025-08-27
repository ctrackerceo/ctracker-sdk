#!/usr/bin/env node
// Test Suite: Referral Swap Variants (direct, path, multi-hop)
// Ejecuta múltiples swaps con diferentes referidos y modelos sobre CoreSwapV4.
// Requiere fondos en la wallet SWAP_TEST_PK (BNB Testnet).

require('dotenv').config();
const { ethers } = require('ethers');
const {
  initContracts,
  swapETHForToken,
  swapETHForTokenPath,
  quoteBest,
  applySlippage,
  calcDeadline
} = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  // === ENV / INPUTS ===
  const testPk = process.env.SWAP_TEST_PK || cfg.referrerPk; // fallback
  if(!testPk) throw new Error('Falta SWAP_TEST_PK (private key con BNB)');
  const amountEth = process.env.SWAP_AMOUNT_ETH || '0.01';
  const amountInWei = ethers.parseEther(amountEth);
  const slippageBps = parseInt(process.env.SWAP_SLIPPAGE_BPS||cfg.claimPercent||'800',10); // reuse claimPercent default if nothing else
  const referralModelIds = (process.env.REFERRAL_MODEL_IDS||'0').split(',').map(s=>s.trim()).filter(Boolean).map(n=>parseInt(n,10));
  const requestedTiers = (process.env.REQUESTED_TIERS||'0').split(',').map(s=>s.trim()).filter(Boolean).map(n=>parseInt(n,10));
  const simplePath = [cfg.wNative || process.env.WNATIVE_V4, cfg.ctkToken || process.env.CTK_TOKEN].filter(Boolean);
  const intermediate = process.env.INTERMEDIATE_TOKEN;
  const multiHopPath = intermediate ? [simplePath[0], intermediate, simplePath[1]] : null;
  const dryRun = /^true$/i.test(process.env.DRY_RUN||'false');
  const stopOnError = !/^false$/i.test(process.env.STOP_ON_ERROR||'true');
  const referrers = (process.env.REFERRER_LIST||'').split(',').map(s=>s.trim()).filter(x=>x) || [];
  // Permitir pasar referrers vía archivo .env o CLI; si no, usar los que usuario pegó manualmente (puede editar aquí):
  if(referrers.length === 0){
    referrers.push(
      '0x038FDaEB592C4D046Cef687309104661C735F391',
      '0x588305AD0261bf6873dCF75A77D3a502e938f645',
      '0x2D73eF4441265bcfeb7e097b33e8F2C479439fc5'
    );
  }

  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(testPk, provider);
  const { core } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });

  console.log('=== Referral Swap Test Suite ===');
  console.log('Wallet:', wallet.address);
  console.log('AmountIn (ETH):', amountEth, 'Wei:', amountInWei.toString());
  console.log('Referrers:', referrers);
  console.log('Models:', referralModelIds, 'RequestedTiers:', requestedTiers);
  console.log('SimplePath:', simplePath);
  console.log('MultiHopPath:', multiHopPath);
  console.log('DryRun:', dryRun);

  const iface = new ethers.Interface([
    'event SwapExecuted(address indexed user,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut,uint256 platformFee,uint256 referralFee,uint256 modelId,uint8 tier,address router,uint256 timestamp)'
  ]);

  const results = [];

  for(const ref of referrers){
    for(const modelId of referralModelIds){
      for(const tier of requestedTiers){
        // Case A: Direct best-path swapETHForToken
        await runCase({ label:'direct', referrer:ref, modelId, tier, path:null });
        // Case B: Simple forced path
        if(simplePath.length === 2){
          await runCase({ label:'path-simple', referrer:ref, modelId, tier, path:simplePath });
        }
        // Case C: Multi-hop path
        if(multiHopPath){
          await runCase({ label:'path-multihop', referrer:ref, modelId, tier, path:multiHopPath });
        }
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  for(const r of results){
    console.log(`${r.label} | ref:${r.referrer.slice(0,8)} | model:${r.modelId} | tier:${r.tier} | out:${r.amountOut} | tx:${r.txHash || r.note}`);
  }

  async function runCase({ label, referrer, modelId, tier, path }){
    try {
      let minOut = 0n;
      // Intentar quote si no es path forzado
      if(!path){
        try {
          const q = await quoteBest(core, amountInWei, simplePath[0], simplePath[1]);
          if(q.amountOut && q.amountOut > 0n){
            minOut = applySlippage(q.amountOut, slippageBps);
          }
        } catch {}
      }
      if(dryRun){
        results.push({ label, referrer, modelId, tier, amountOut:'-', txHash:'-', note:'DRY_RUN' });
        console.log(`[DRY] ${label} ref ${referrer} model ${modelId} tier ${tier}`);
        return;
      }
      let receipt;
      if(path){
        if(path.length === 2){
          receipt = await swapETHForTokenPath({ core, path, amountInWei, minOut, referralModelId:modelId, referrer, requestedTier:tier, recipient:wallet.address });
        } else {
          receipt = await swapETHForTokenPath({ core, path, amountInWei, minOut, referralModelId:modelId, referrer, requestedTier:tier, recipient:wallet.address });
        }
      } else {
        receipt = await swapETHForToken({ core, tokenOut: simplePath[1], amountInWei, referralModelId:modelId, referrer, requestedTier:tier, recipient:wallet.address, wNative: simplePath[0], slippageBps });
      }
      const logs = receipt.logs || [];
      let parsed;
      for(const lg of logs){
        try { parsed = iface.parseLog(lg); if(parsed) break; } catch {}
      }
      const amountOut = parsed ? parsed.args.amountOut.toString() : 'NA';
      console.log(`${label} OK ref:${referrer} model:${modelId} tier:${tier} out:${amountOut} tx:${receipt.transactionHash}`);
      results.push({ label, referrer, modelId, tier, amountOut, txHash: receipt.transactionHash });
    } catch (e){
      console.error(`${label} FAIL ref:${referrer} model:${modelId} tier:${tier}`, e.message);
      results.push({ label, referrer, modelId, tier, amountOut:'0', note:`ERR:${e.message}` });
      if(stopOnError) throw e;
    }
  }
}

main().catch(e=>{ console.error('Fatal:', e); process.exit(1); });
