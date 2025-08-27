/**
 * C-TRACKER V4 FRONTEND / THIRD-PARTY API UTILITIES
 * -------------------------------------------------
 * Este módulo expone funciones de alto nivel para integrarse desde un frontend
 * o servicios externos con los contratos CoreSwapV4 y ReferralEngineV4.
 * 
 * Objetivos:
 *  - Swaps (todas las variantes soportadas) con parámetros correctos.
 *  - Gestión de referrals: selección de modelo, envío de referrer.
 *  - Consulta de pending referral y claim (nativo o token) de forma segura.
 *  - Inferir deadlines, minOut y validaciones básicas.
 *  - Explicar modelos de referral y cómo pasar parámetros.
 *  - Minimizar errores de input (tipos, units, deadlines, paths, slippage).
 * 
 * Dependencias: ethers v6
 * Requiere que el caller provea un signer (wallet) o provider según la operación.
 */

const { ethers } = require('ethers');

/** ---------------------------------------------------------------------------
 * CONFIG / CONSTANTES
 * --------------------------------------------------------------------------*/
const DEFAULT_DEADLINE_SECS = 600; // 10 minutos

/**
 * Estructura esperada del objeto config pasado a initContracts:
 * {
 *   coreAddress: '0x...',
 *   referralAddress: '0x...',
 *   feeManagerAddress: '0x...' (opcional para snapshots),
 *   wNative: '0x...',
 *   provider: ethers.Provider, // requerido
 *   signer: ethers.Signer (opcional para lecturas, requerido para writes)
 * }
 */

const CoreSwapV4_ABI = [
  'event SwapExecuted(address indexed user,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut,uint256 platformFee,uint256 referralFee,uint256 modelId,uint8 tier,address router,uint256 timestamp)',
  'function quoteBestPath(uint256 amountIn,address tokenIn,address tokenOut) view returns (address router,address[] path,uint256 amountOut)',
  'function wNative() view returns (address)',
  'function swapETHForToken(address tokenOut,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient) payable',
  // Nueva variante explícita para modelo 2 (cadena completa refChain[3])
  'function swapETHForTokenChain(address tokenOut,uint256 minOut,uint256 deadline,uint256 referralModelId,address[3] refChain,uint256 requestedTier,address recipient) payable',
  'function swapTokenForETH(address tokenIn,uint256 amountIn,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient)',
  'function swapTokenForToken(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient)',
  'function swapETHForTokenPath(address[] path,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient) payable',
  'function swapTokenForTokenPath(address[] path,uint256 amountIn,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient)',
  'function platformPool() view returns (uint256)'
];

const ReferralEngineV4_ABI = [
  'function pendingReferral(address) view returns (uint256)',
  'function totalPendingReferral() view returns (uint256)',
  'function referralUserSnapshot(address user,address feeManager) view returns (bool claimable,uint256 pending,address l1,address l2,address l3,uint8 tier,uint256 volume)',
  'function claimReferral(uint256 amount,address tokenOut,uint256 minOut,uint256 deadline,address recipient) returns (uint256)',
  'function claimReferralPath(uint256 amount,address[] path,uint256 minOut,uint256 deadline,address recipient) returns (uint256)',
  'function isTokenWhitelisted(address) view returns (bool)',
  'function wNative() view returns (address)'
  , 'function leftoverReferral() view returns (uint256)'
  , 'function modelLeftover(uint256) view returns (uint256)'
];

/** ---------------------------------------------------------------------------
 * REFERRAL MODELS - DESCRIPCIÓN LÓGICA
 * --------------------------------------------------------------------------*/
/**
 * Un ReferralModel define niveles (levels) y basis points (bps) por nivel sobre la base
 * de cálculo (feeBase) que entrega el Core (fee en nativo sujeta a reparto). Ejemplo:
 *  id: 2
 *  levels: 3
 *  levelBps: [500, 300, 200]  => Nivel1 5%, Nivel2 3%, Nivel3 2% (total 10% = 1000 bps)
 * El contrato valida que la suma no exceda un maxTotalBP global (ej. 3000 = 30%).
 *
 * Parámetros de swap relevantes para referral:
 *  - referralModelId: ID numérico del modelo (uint256)
 *  - referrer: address del Level1 (puede ser zero si no se desea referral) 
 *    El contrato internamente registrará la cadena L2 y L3 copiando los L1/L2 del referrer.
 *  - requestedTier: (en CoreSwapV4 actualmente no se fuerza; se mantiene para compat / futuro)
 *
 * Flujo de acumulación:
 *  1. Core calcula platformFee + referralFee total sobre el monto en nativo (entrada o salida según la dirección del swap).
 *  2. Llama a referralEngine.accrueReferral(user, referrer, modelId, feeBase).
 *  3. ReferralEngine reparte a cada nivel (si existe) y almacena _pending[address] += part.
 *  4. El total pendiente global _totalPending se incrementa.
 *  5. El Core transfiere inmediatamente la parte referral (en nativo) al ReferralEngine (custodia).
 *
 * Claim:
 *  - claimReferral(amount, tokenOut, minOut, deadline, recipient)
 *      amount = 0 o > pending => usa full pending.
 *      tokenOut = 0x0 => se entrega nativo directamente.
 *      tokenOut != 0 y whitelisted => se usa conversión wNative->tokenOut vía router configurado.
 *  - claimReferralPath(amount, path, minOut, deadline, recipient)
 *      path[0] debe ser wNative; path[last] token deseado (whitelisted). Permite control de ruta.
 *
 * Recomendación Frontend:
 *  - Mostrar pending (snapshot) y habilitar botón Claim cuando claimable=true.
 *  - Para reclamo con conversión proporcionar campos: tokenOut o path y minOut calculado con un quote ext.
 */

/** ---------------------------------------------------------------------------
 * INIT HELPERS
 * --------------------------------------------------------------------------*/
function initContracts(cfg){
  if(!cfg.provider) throw new Error('provider requerido');
  const core = new ethers.Contract(cfg.coreAddress, CoreSwapV4_ABI, cfg.signer||cfg.provider);
  const referral = new ethers.Contract(cfg.referralAddress, ReferralEngineV4_ABI, cfg.signer||cfg.provider);
  return { core, referral };
}

/** ---------------------------------------------------------------------------
 * UTILS
 * --------------------------------------------------------------------------*/
function calcDeadline(secondsAhead = DEFAULT_DEADLINE_SECS){
  return Math.floor(Date.now()/1000) + secondsAhead;
}

function applySlippage(amountOut, slippageBps){
  if (!amountOut || amountOut === 0n) return 0n;
  return amountOut * BigInt(10000 - slippageBps) / 10000n;
}

/** ---------------------------------------------------------------------------
 * SWAP QUOTE + EXECUTION
 * --------------------------------------------------------------------------*/
async function quoteBest(core, amountInWei, tokenIn, tokenOut){
  const [router, path, amountOut] = await core.quoteBestPath(amountInWei, tokenIn, tokenOut);
  return { router, path, amountOut };
}

async function swapETHForToken({ core, tokenOut, amountInWei, wNative, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){

/** ---------------------------------------------------------------------------
 * swapETHForTokenChain (Modelo 2 explícito)
 * Permite pasar cadena completa [L1,L2,L3]. Si alguna posición es address(0) se acumula leftover.
 * Parámetros principales:
 *  - refChain: array length 3 con addresses (puede contener zeros al final)
 *  - referralModelId: debe ser 2 para que Core procese cadena explícita.
 * Slippage: se calcula sobre output bruto esperado y se aplica sobre neto.
 */
async function swapETHForTokenChain({ core, tokenOut, amountInWei, refChain, wNative, slippageBps=800, referralModelId=2, requestedTier=0, recipient=ethers.ZeroAddress }){
  if(!Array.isArray(refChain) || refChain.length !== 3) throw new Error('refChain debe tener length 3');
  let wNativeAddr = wNative; if(!wNativeAddr){ try { wNativeAddr = await core.wNative(); } catch {}
  }
  const quote = wNativeAddr ? await core.quoteBestPath(amountInWei, wNativeAddr, tokenOut).catch(()=>({amountOut:0n})) : { amountOut:0n };
  const minOut = quote.amountOut ? applySlippage(quote.amountOut, slippageBps) : 0n;
  const deadline = calcDeadline();
  const tx = await core.swapETHForTokenChain(tokenOut, minOut, deadline, referralModelId, refChain, requestedTier, recipient, { value: amountInWei });
  return tx.wait();
}
  // Determina tokenIn como wNative (wrapped) para quote
  let wNativeAddr = wNative;
  if(!wNativeAddr){
    try { wNativeAddr = await core.wNative(); } catch { /* ignore */ }
  }
  const quote = wNativeAddr ? await core.quoteBestPath(amountInWei, wNativeAddr, tokenOut).catch(()=>({amountOut:0n})) : { amountOut:0n };
  const minOut = quote.amountOut ? applySlippage(quote.amountOut, slippageBps) : 0n;
  const deadline = calcDeadline();
  const tx = await core.swapETHForToken(tokenOut, minOut, deadline, referralModelId, referrer, requestedTier, recipient, { value: amountInWei });
  return tx.wait();
}

async function swapTokenForETH({ core, tokenIn, amountInWei, minOut=0n, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  const deadline = calcDeadline();
  const tx = await core.swapTokenForETH(tokenIn, amountInWei, minOut, deadline, referralModelId, referrer, requestedTier, recipient);
  return tx.wait();
}

async function swapTokenForToken({ core, tokenIn, tokenOut, amountInWei, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  const quote = await core.quoteBestPath(amountInWei, tokenIn, tokenOut).catch(()=>({amountOut:0n}));
  const minOut = quote.amountOut ? applySlippage(quote.amountOut, slippageBps) : 0n;
  const deadline = calcDeadline();
  const tx = await core.swapTokenForToken(tokenIn, tokenOut, amountInWei, minOut, deadline, referralModelId, referrer, requestedTier, recipient);
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * PATH SWAPS (explicit routing)
 * --------------------------------------------------------------------------*/
async function swapETHForTokenPath({ core, path, amountInWei, expectedOut, minOut, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  if(!Array.isArray(path) || path.length < 2) throw new Error('path inválido');
  let computedMinOut = 0n;
  if (minOut != null) {
    computedMinOut = minOut;
  } else if (expectedOut != null) {
    computedMinOut = applySlippage(BigInt(expectedOut), slippageBps);
  }
  const deadline = calcDeadline();
  const tx = await core.swapETHForTokenPath(path, computedMinOut, deadline, referralModelId, referrer, requestedTier, recipient, { value: amountInWei });
  return tx.wait();
}

async function swapTokenForTokenPath({ core, path, amountInWei, expectedOut, minOut, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  if(!Array.isArray(path) || path.length < 2) throw new Error('path inválido');
  let computedMinOut = 0n;
  if (minOut != null) {
    computedMinOut = minOut;
  } else if (expectedOut != null) {
    computedMinOut = applySlippage(BigInt(expectedOut), slippageBps);
  }
  const deadline = calcDeadline();
  const tx = await core.swapTokenForTokenPath(path, amountInWei, computedMinOut, deadline, referralModelId, referrer, requestedTier, recipient);
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * REFERRAL QUERIES
 * --------------------------------------------------------------------------*/
async function getReferralSnapshot(referral, user, feeManager){
  return referral.referralUserSnapshot(user, feeManager||ethers.ZeroAddress);
}

async function getPending(referral, user){
  return referral.pendingReferral(user);
}

// Snapshot helpers para claim
async function hasClaimable(referral, user, feeManager){
  const snap = await referral.referralUserSnapshot(user, feeManager||ethers.ZeroAddress);
  return snap[0];
}
async function getClaimableAmount(referral, user){
  return referral.pendingReferral(user); // alias semántico
}

/** ---------------------------------------------------------------------------
 * CLAIM FUNCTIONS
 * --------------------------------------------------------------------------*/
async function claimNative({ referral, amount=0n, recipient=ethers.ZeroAddress }){
  const deadline = calcDeadline();
  const tx = await referral.claimReferral(amount, ethers.ZeroAddress, 0, deadline, recipient);
  return tx.wait();
}

async function claimToken({ referral, tokenOut, amount=0n, minOut=0n, recipient=ethers.ZeroAddress, deadlineSecs=DEFAULT_DEADLINE_SECS }){
  const deadline = calcDeadline(deadlineSecs);
  const tx = await referral.claimReferral(amount, tokenOut, minOut, deadline, recipient);
  return tx.wait();
}

async function claimPath({ referral, path, amount=0n, minOut=0n, recipient=ethers.ZeroAddress, deadlineSecs=DEFAULT_DEADLINE_SECS }){
  const deadline = calcDeadline(deadlineSecs);
  const tx = await referral.claimReferralPath(amount, path, minOut, deadline, recipient);
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * VALIDATION HELPERS (Frontend Pre-checks)
 * --------------------------------------------------------------------------*/
function validateReferralInputs({ referralModelId, referrer }){
  if (referralModelId < 0) throw new Error('referralModelId inválido');
  if (!ethers.isAddress(referrer)) throw new Error('referrer no es address');
}

function validateClaimToken({ tokenOut, minOut }){
  if (!ethers.isAddress(tokenOut)) throw new Error('tokenOut no es address');
  if (minOut < 0n) throw new Error('minOut negativo');
}

function validateClaimPath(path){
  if (!Array.isArray(path) || path.length < 2) throw new Error('path inválido');
  path.forEach(a=>{ if(!ethers.isAddress(a)) throw new Error('address inválido en path'); });
}

/** ---------------------------------------------------------------------------
 * EJEMPLOS DE USO (comentado) PARA FRONTEND
 * --------------------------------------------------------------------------*/
/*
import { BrowserProvider } from 'ethers';
import { initContracts, quoteBest, swapETHForToken } from './api/index.js';

async function ejemplo(){
 const provider = new BrowserProvider(window.ethereum);
 const signer = await provider.getSigner();
 const { core, referral } = initContracts({
   coreAddress: process.env.NEXT_PUBLIC_CORE,
   referralAddress: process.env.NEXT_PUBLIC_REFERRAL,
   provider, signer
 });
 // Quote
 const amountIn = ethers.parseEther('0.5');
 const { path, amountOut } = await quoteBest(core, amountIn, WBNB, CTK);
 // Swap
 await swapETHForToken({ core, tokenOut: CTK, amountInWei: amountIn, referralModelId:2, referrer:'0xRef...' });
 // Pending
 const pending = await getPending(referral, await signer.getAddress());
 // Claim native
 await claimNative({ referral, amount: 0n }); // 0 => full
}
*/

/** ---------------------------------------------------------------------------
 * EXPORTS
 * --------------------------------------------------------------------------*/
module.exports = {
  initContracts,
  quoteBest,
  swapETHForToken,
  swapETHForTokenChain,
  swapTokenForETH,
  swapTokenForToken,
  swapETHForTokenPath,
  swapTokenForTokenPath,
  getReferralSnapshot,
  getPending,
  hasClaimable,
  getClaimableAmount,
  claimNative,
  claimToken,
  claimPath,
  validateReferralInputs,
  validateClaimToken,
  validateClaimPath,
  calcDeadline,
  applySlippage
};

/** ---------------------------------------------------------------------------
 * TIER / VIP HELPERS
 * --------------------------------------------------------------------------*/
/**
 * determineRequestedTier
 * Dado un volumen acumulado (bigint) y una lista de reglas [{ minVolume, tier }]
 * devuelve el tier más alto cuyo minVolume <= volume. Si no coincide, retorna 0.
 * Reglas pueden venir sin ordenar; empates se resuelven por tier numérico mayor.
 * minVolume acepta bigint o string (parseado a bigint).
 */
function determineRequestedTier(volume, rules){
  if (!rules || !Array.isArray(rules) || rules.length === 0) return 0;
  const vol = BigInt(volume);
  let chosen = 0;
  for (const r of rules){
    if (r == null) continue;
    if (r.tier == null) continue;
    let mv;
    try { mv = typeof r.minVolume === 'bigint' ? r.minVolume : BigInt(r.minVolume); } catch { continue; }
    if (vol >= mv && r.tier > chosen) chosen = r.tier;
  }
  return chosen;
}

module.exports.determineRequestedTier = determineRequestedTier;
// Re-export config loader for external projects
try { module.exports.loadApiConfig = require('./config').loadApiConfig; } catch {}

/** ---------------------------------------------------------------------------
 * CLAIM PERCENTAGE HELPER
 * --------------------------------------------------------------------------*/
async function claimPercentage({ referral, percentage, tokenOut, path, minOut=0n, recipient=ethers.ZeroAddress }){
  if (percentage <=0 || percentage > 100) throw new Error('percentage inválido');
  const me = recipient !== ethers.ZeroAddress ? recipient : undefined;
  const addr = me || (referral.runner && referral.runner.address) || (referral.signer && referral.signer.address) || undefined;
  if(!addr) throw new Error('No signer/address context para calcular pending');
  const pending = await referral.pendingReferral(addr);
  if (pending === 0n) return { skipped:true, reason:'No pending' };
  const amount = (pending * BigInt(percentage)) / 100n;
  if (path){
    const deadline = calcDeadline();
    const tx = await referral.claimReferralPath(amount, path, minOut, deadline, recipient);
    return tx.wait();
  }
  if (tokenOut){
    const deadline = calcDeadline();
    const tx = await referral.claimReferral(amount, tokenOut, minOut, deadline, recipient);
    return tx.wait();
  }
  // native
  const deadline = calcDeadline();
  const tx = await referral.claimReferral(amount, ethers.ZeroAddress, 0, deadline, recipient);
  return tx.wait();
}
module.exports.claimPercentage = claimPercentage;

/** ---------------------------------------------------------------------------
 * parseTierRules helper (string -> array validada)
 * --------------------------------------------------------------------------*/
function parseTierRules(str){
  if(!str) return [];
  let arr;
  try { arr = JSON.parse(str); } catch { return []; }
  if(!Array.isArray(arr)) return [];
  return arr.filter(r=> r && (r.minVolume!==undefined) && (r.tier!==undefined));
}
module.exports.parseTierRules = parseTierRules;

/** ---------------------------------------------------------------------------
 * Leftover Helpers
 * --------------------------------------------------------------------------*/
async function getGlobalLeftover(referral){ return referral.leftoverReferral(); }
async function getModelLeftover(referral, modelId){ return referral.modelLeftover(modelId); }
module.exports.getGlobalLeftover = getGlobalLeftover;
module.exports.getModelLeftover = getModelLeftover;
