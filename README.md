# C-Tracker V4 SDK / API Documentation

<p align="center">
  <strong>Enterprise‑grade swap + referral + fee toolkit for EVM ecosystems</strong><br/>
  <em>Deterministic helpers · Multi‑level referrals · Accurate post‑swap reconciliation</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ctracker/sdk"><img alt="npm version" src="https://img.shields.io/npm/v/%40ctracker%2Fsdk?color=3B82F6&label=npm"/></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg"/></a>
  <img alt="Node >=18" src="https://img.shields.io/badge/node-%3E%3D18-blue"/>
  <img alt="Ethers v6" src="https://img.shields.io/badge/ethers-v6.x-6C47FF"/>
  <img alt="CI" src="https://img.shields.io/badge/build-passing-success"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/typed-.d.ts-informational"/>
</p>

---
## Table of Contents
> (Auto‑maintained manually; section numbers preserved. New material appended without altering existing content.)

1. [Overview](#1-overview)  
2. [Core Concepts](#2-core-concepts)  
3. [Architectural Flow (Swap with Referral)](#3-architectural-flow-swap-with-referral)  
4. [Referral Model Parameters](#4-referral-model-parameters)  
5. [Pending vs Claimable](#5-pending-vs-claimable)  
6. [Claim Mechanics](#6-claim-mechanics)  
7. [SDK Contents](#7-sdk-contents)  
8. [Installation Options](#8-installation-options)  
9. [Environment / Configuration](#9-environment--configuration)  
10. [Quick Start (Browser)](#10-quick-start-browser)  
11. [Node Script Example](#11-node-script-example-partial-claim-in-token)  
12. [React Hooks (Optional Pattern)](#12-react-hooks-optional-pattern)  
13. [Events](#13-events)  
14. [Publishing as SDK](#14-publishing-as-sdk-recommended-steps)  
15. [TypeScript Usage](#15-typescript-usage)  
16. [Slippage Strategy](#16-slippage-strategy)  
17. [Partial Claims Patterns](#17-partial-claims-patterns)  
18. [Error Handling Guidelines](#18-error-handling-guidelines)  
19. [Security Notes](#19-security-notes)  
20. [Advanced Extensions (Roadmap)](#20-advanced-extensions-roadmap)  
21. [Testing Strategy](#21-testing-strategy)  
22. [Versioning](#22-versioning)  
23. [Troubleshooting Quick Table](#23-troubleshooting-quick-table)  
24. [License](#24-license)  
25. [Contact / Contribution](#25-contact--contribution)  
26. [Minimal Checklist for Integrators](#26-minimal-checklist-for-integrators)  
27. [VIP / Premium Fee Tiers](#27-vip--premium-fee-tiers-requestedtier)  
28. [Tier Helper determineRequestedTier](#28-tier-helper-determinerrequestedtier)  
29. [Browser UMD Build](#29-browser-umd-build)  
34. [Claim Parcial Percentual](#34-claim-parcial-percentual-claimpercentage-helper)  
35. [Support Matrix](#35-support-matrix)  
36. [Development Workflow](#36-development-workflow)  
37. [Release & Version Promotion](#37-release--version-promotion)  
38. [Performance & Gas Considerations](#38-performance--gas-considerations)  
39. [Security Policy & Vulnerability Reporting](#39-security-policy--vulnerability-reporting)  
40. [Changelog Policy](#40-changelog-policy)  
41. [FAQ](#41-faq)  
42. [Glossary](#42-glossary)  
43. [High-Level Architecture Diagram](#43-high-level-architecture-diagram)  
44. [Acknowledgements](#44-acknowledgements)  

---

Full integration guide for third-party platforms, frontends, bots, analytics systems, and services that want to embed the C-Tracker V4 swap + referral + fee infrastructure.

---
## 1. Overview
C-Tracker V4 provides:
1. Smart Swap Aggregation (routing + real received reconciliation for truthful accounting).
2. Modular Fee System (platform + referral + tier logic).
3. Multi‑Level Referral Engine (up to 3 levels, model selectable per swap).
4. Secure Custody + Flexible Claim of Referral Rewards (native, direct tokenOut, or custom path).
5. Deterministic, frontend-safe helper SDK (this folder) to minimize integration mistakes.

This `api/` folder can be published as an npm module (see Section 14) or imported locally.

---
## 2. Core Concepts
| Component | Purpose |
|-----------|---------|
| `CoreSwapV4` | Executes swaps, calculates and transfers fees (platform + referral). Emits `SwapExecuted`. Uses real balance delta to prevent router over-reporting. |
| `ReferralEngineV4` | Accrues multi-level referral rewards in native coin (BNB) and stores per-user pending. Allows claiming in native or converted token via router path. |
| `FeeManagerV4` | (Optional in UI) Provides tier & platform fee structure used by Core. |
| `AnalyticsAdapterV4` | (Optional) Emits / stores structured analytics events. |

---
## 3. Architectural Flow (Swap with Referral)
1. User submits swap via Core including `referralModelId`, `referrer`, `requestedTier` (reserved for future logic).
2. Core determines platform + referral fees (native basis depending on direction).
3. Core transfers referral fee (in native) to ReferralEngine.
4. ReferralEngine splits across L1/L2/L3 per model bps; updates `_pending` per beneficiary.
5. User receives tokens; event emitted with actual `amountOut` (reconciled with real received).
6. (Modelo 2 explícito) Si se utiliza `swapETHForTokenChain` y alguna posición de la cadena es `address(0)`, la porción correspondiente se acumula en `leftoverReferral` / `modelLeftover[2]`.

---
## 4. Referral Model Parameters
Each model defines: `levels`, `levelBps[]` (basis points per level). Sum cannot exceed global max (e.g. 3000 = 30%). Example: `[500,300,200]` -> 5%,3%,2% of referral fee base.

---
## 5. Pending vs Claimable
`referralUserSnapshot(address user, address feeManager)` returns:
`(bool claimable,uint256 pending,address l1,address l2,address l3,uint8 tier,uint256 volume)`

`claimable` may be toggled by protocol rules (e.g. min volume / cooldown). UI should gate claim button on this flag unless forced admin flow.

---
## 6. Claim Mechanics
| Method | Usage |
|--------|-------|
| `claimReferral(amount, tokenOut, minOut, deadline, recipient)` | Native claim when `tokenOut == 0x0`. Token conversion when `tokenOut` is whitelisted. `amount=0` => claim full pending. |
| `claimReferralPath(amount, path, minOut, deadline, recipient)` | Path-based conversion. `path[0]` must be `wNative()`. Last element whitelisted. |

Slippage control is via `minOut` + `deadline` (unix seconds). Amount is floor truncated if halving logic done externally.

---
## 7. SDK Contents
File: `index.js` exports:
```
initContracts, quoteBest, swapETHForToken, swapTokenForETH, swapTokenForToken,
swapETHForTokenChain,
getReferralSnapshot, getPending,
claimNative, claimToken, claimPath,
validateReferralInputs, validateClaimToken, validateClaimPath,
calcDeadline, applySlippage
```

Types (see `index.d.ts`).

---
## 8. Installation Options
### A) Local (Monorepo style)
```
// Use relative import
const api = require('./api');
```

### B) Publish as NPM Package
1. (Optional) Create `api/package.json` with name: `@ctracker/sdk`.
2. Run `npm publish` from `api/` (ensure only distributable files included).
3. Downstream project: `npm install @ctracker/sdk` and then:
```
import { initContracts, swapETHForToken } from '@ctracker/sdk';
```

### C) Direct Bundle (CDN)
Bundle with esbuild/rollup into a UMD exposing `CTrackerSDK`. Provide minimal wrapper:
```
window.CTrackerSDK = require('./api');
```

---
## 9. Environment / Configuration
| Variable | Description |
|----------|-------------|
| `CORE_V4` | Deployed CoreSwapV4 address |
| `REFERRAL_V4` | Deployed ReferralEngineV4 address |
| `FEE_V4` | FeeManagerV4 (optional for snapshot tier display) |
| `WNATIVE_V4` | Wrapped native token address |
| `CTK_TOKEN` | Example tokenOut for conversions |
| `REFERRER` | Default referral address (L1) to inject in swaps |
| `REFERRER_PRIVATE_KEY` | Key used by scripts to simulate that referrer claiming |

Frontends typically inject these as `NEXT_PUBLIC_*` variants.

---
## 10. Quick Start (Browser)
```js
import { BrowserProvider } from 'ethers';
import { initContracts, quoteBest, swapETHForToken, getPending, claimNative } from '@ctracker/sdk';

const CORE = process.env.NEXT_PUBLIC_CORE;
const REFERRAL = process.env.NEXT_PUBLIC_REFERRAL;

async function run(){
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const { core, referral } = initContracts({ coreAddress: CORE, referralAddress: REFERRAL, provider, signer });
  const amountIn = ethers.parseEther('0.1');
  const quote = await quoteBest(core, amountIn, WBNB, CTK);
  console.log('Best path', quote.path, 'amountOut', quote.amountOut.toString());
  await swapETHForToken({ core, tokenOut: CTK, amountInWei: amountIn, referralModelId: 2, referrer: '0xRef...' });
  const pending = await getPending(referral, await signer.getAddress());
  console.log('Pending native', pending.toString());
  await claimNative({ referral, amount: 0n });
}
```

---
## 11. Node Script Example (Partial Claim in Token)
```js
const { ethers } = require('ethers');
const { initContracts, getPending, claimToken, applySlippage, calcDeadline } = require('@ctracker/sdk');

async function main(){
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.REFERRER_PRIVATE_KEY, provider);
  const { referral } = initContracts({ coreAddress: process.env.CORE_V4, referralAddress: process.env.REFERRAL_V4, provider, signer: wallet });
  const pending = await getPending(referral, wallet.address);
  const half = pending / 2n;
  // Assume external quote gave expectedOut
  const expectedOut = 1000n * 10n ** 18n; // placeholder
  const minOut = applySlippage(expectedOut, 800); // 8% slippage
  const receipt = await claimToken({ referral, tokenOut: process.env.CTK_TOKEN, amount: half, minOut });
  console.log('Claim tx', receipt.transactionHash);
}
main();
```

---
## 12. React Hooks (Optional Pattern)
```ts
import { useEffect, useState, useCallback } from 'react';
import { getPending } from '@ctracker/sdk';

export function useReferralPending(referralContract, address, pollMs=15000){
  const [pending,setPending] = useState(0n);
  const refresh = useCallback(async ()=>{
    if(!referralContract || !address) return;
    setPending(await getPending(referralContract, address));
  },[referralContract,address]);
  useEffect(()=>{ refresh(); const id=setInterval(refresh,pollMs); return ()=>clearInterval(id); },[refresh,pollMs]);
  return pending;
}
```

---
## 13. Events
### Leftover Events / Variables
Cuando se usa el modelo 2 explícito (`swapETHForTokenChain`) con una cadena incompleta (por ejemplo `[L1,L2,0x0]`), la parte del nivel vacío se acumula:
- `leftoverReferral()` acumulado global de todas las sobras.
- `modelLeftover(2)` acumulado específico del modelo 2.
`SwapExecuted` fields:
| Field | Meaning |
|-------|---------|
| `user` | msg.sender initiating swap |
| `tokenIn/tokenOut` | Assets swapped |
| `amountIn/amountOut` | Input and reconciled output (post real-balance check) |
| `platformFee/referralFee` | Native fee components |
| `modelId` | Referral model used |
| `tier` | Tier associated (future logic) |
| `router` | Router selected from aggregator logic |
| `timestamp` | Block timestamp stored for analytics |

---
## 14. Publishing as SDK (Recommended Steps)
1. Copy `api/` to new repo or keep inside monorepo.
2. Create `api/package.json`:
```json
{
  "name": "@ctracker/sdk",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "index.js",
  "types": "index.d.ts",
  "license": "MIT",
  "peerDependencies": { "ethers": ">=6.8.0" }
}
```
3. `npm publish --access public` (after `npm login`).
4. Consumers: `npm install @ctracker/sdk ethers`.

---
## 15. TypeScript Usage
The provided `index.d.ts` supplies strongly typed signatures. Example:
```ts
import { initContracts, swapTokenForToken, applySlippage, QuoteBestResult } from '@ctracker/sdk';
```

---
## 16. Slippage Strategy
3. Para modelo 2 explícito, la estimación bruta debe ajustarse a output neto tras fees (platform + referral). El SDK aplica slippage sobre el bruto — para un control más estricto puedes recalcular `minOut` proporcional multiplicando por `(1 - (platformBP+referralBP)/10000)`.
Nueva función: `swapETHForTokenChain`.

Uso básico:
```js
await swapETHForTokenChain({
  core,
  tokenOut: CTK,
  amountInWei: ethers.parseEther('0.3'),
  refChain: [L1, L2, ethers.ZeroAddress], // L3 vacío => leftover
  referralModelId: 2
});
```

Recomendaciones:
1. Siempre enviar exactamente 3 posiciones; rellenar vacías con `ethers.ZeroAddress`.
2. Validar addresses front-end antes de llamar.
3. Mostrar al usuario la distribución resultante prevista (L1/L2 y leftover) antes de firmar.
4. Si la UX exige edición de cadena, permitir reorder sólo antes del primer swap del usuario (después la cadena queda fijada internamente para ese trader en modelos legacy; la variante explícita fuerza la distribución en ese swap sin afectar encadenados previos).
5. Para auditar uso de leftover, leer periódicamente `getGlobalLeftover` y `getModelLeftover(referral,2)`.
1. Fetch quote `amountOut`.
2. Compute `minOut = applySlippage(amountOut, slippageBps)`.
3. Higher volatility pairs => larger bps (e.g. 1000 = 10%).
4. For claims converting native -> token, use an external DEX quote (off-chain) if the engine does not internally expose path quoting for claim.

---
## 17. Partial Claims Patterns
| Goal | Approach |
|------|----------|
| 50% claim | `amount = pending/2n` (floor) |
| Fixed amount | Provide specific wei amount <= pending |
| Full | `amount = 0n` |
| Auto compound | Claim tokenOut, then swap to desired staking asset in same script |

---
## 18. Error Handling Guidelines
| Error | Cause | Mitigation |
|-------|-------|-----------|
| `provider requerido` | Missing provider in `initContracts` | Pass ethers provider |
| Revert: deadline | Deadline expired | Increase `DEFAULT_DEADLINE_SECS` or pass custom |
| Revert: minOut | Price slipped beyond tolerance | Re‐quote + retry with new minOut |
| Revert: token not whitelisted | Token not approved in ReferralEngine | Use a whitelisted token or path variant |
| Insufficient allowance | ERC20 approval missing for tokenIn | Call `approve(Core, amount)` first |

---
## 19. Security Notes
1. Always bound `minOut` to protect against MEV / sandwich impact.
2. Consider batching approvals and swaps in a single session to reduce stale risk.
3. Never expose private keys in client code; only sign locally via wallet provider.
4. Monitor event `SwapExecuted` for abnormal `amountOut` deltas (sanity threshold alerts).
5. Use a restricted RPC or rate limiter for backend hot paths.

---
## 20. Advanced Extensions (Roadmap)
| Feature | Description |
|---------|-------------|
| Tier Enforcement | Dynamically adjust fees based on volume snapshot tier |
| Multi-Router Simulation | Off-chain scoring of candidate routers before on-chain submit |
| Batch Claims | Aggregate multiple addresses referral claims in a relayer pattern |
| Auto-Compound Module | Native -> claim -> convert -> stake flow |

---
## 21. Testing Strategy
1. Unit: Mock router returns vs real balance to ensure reconciliation logic.
2. Integration: Simulate referral chains (L1->L2->L3) and verify pending splits.
3. Claim Path: Fuzz test path arrays (length, invalid addresses) expecting reverts.
4. Gas Snapshot: Monitor claim vs swap gas to detect regression.

---
## 22. Versioning
Semantic versioning: MAJOR (contract/interface breaking) / MINOR (new helpers) / PATCH (docs & fixes).

---
## 23. Troubleshooting Quick Table
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `pending = 0` after expected accrual | Referral model ID mismatch or referrer zero | Verify parameters passed to swap |
| Claim tx mined but balance unchanged | Gas consumed offset; claiming native with small amount | Aggregate larger pending before claiming |
| Token claim reverts | minOut too high or token not whitelisted | Lower slippage or check whitelist |
| Swap event amountOut mismatch (router vs user) | Intended by reconciliation patch | Use event value as truth |

---
## 24. License
MIT – See root repository `LICENSE`.

---
## 25. Contact / Contribution
Open GitHub issues for:
* Additional model types
* New swap variants
* Performance & analytics hooks

PRs: Include tests for any new public function.

---
## 26. Minimal Checklist for Integrators
1. Load env addresses.
2. Instantiate provider + signer (user wallet or server key).
3. `initContracts`.
4. (Optional) Fetch quote, compute minOut.
5. Execute swap with referral params.
6. Poll pending; display claim button when `claimable`.
7. On claim: compute (optional) amount fraction + minOut + deadline.
8. Monitor events for UI state (swap histories, earnings, etc.).

---
## 27. VIP / Premium Fee Tiers (requestedTier)
`CoreSwapV4` incluye el parámetro `requestedTier` en cada función de swap. Este SDK ahora lo expone como `requestedTier` opcional en:
* `swapETHForToken`
* `swapTokenForETH`
* `swapTokenForToken`

Uso:
```js
await swapTokenForToken({ core, tokenIn, tokenOut, amountInWei, referralModelId:2, referrer, requestedTier:3 });
```

Notas:
1. Si el contrato todavía no aplica lógica dinámica de tiers, el valor se ignora sin romper compatibilidad.
2. Futuro: el `FeeManagerV4` podrá validar volumen acumulado para habilitar tiers VIP (menor platformFee o mayor referral share).
3. UI recomendada: mostrar tier detectado (snapshot) y permitir al usuario forzar uno inferior (downgrade) o igual, pero evitar enviar uno mayor que el permitido para no provocar revert en versiones futuras.
4. Scripts existentes siguen funcionando porque el default es `0`.

Helper futuro sugerido (no incluido todavía): `determineRequestedTier(volume, rules) => number`.

---
## 28. Tier Helper determineRequestedTier
Se añadió el helper `determineRequestedTier(volume, rules)`.

Firma:
```ts
interface TierRule { minVolume: bigint | string; tier: number; }
function determineRequestedTier(volume: bigint | string, rules: TierRule[]): number;
```

Ejemplo:
```js
const rules = [
  { minVolume: 0n, tier: 0 },
  { minVolume: 1000n * 10n**18n, tier: 1 },      // 1k tokens
  { minVolume: 10000n * 10n**18n, tier: 2 },     // 10k tokens
  { minVolume: 50000n * 10n**18n, tier: 3 }      // 50k tokens
];
const tier = determineRequestedTier(userVolume, rules);
await swapTokenForToken({ core, tokenIn, tokenOut, amountInWei, referralModelId:2, referrer, requestedTier: tier });
```

Reglas prácticas:
1. No dependas de orden; el helper selecciona el mejor tier permitido.
2. Mantén un array de reglas versionado en backend para coherencia multiplataforma.
3. Actualizaciones de tiers deben anunciarse; caches frontend deben invalidarse.

---
## 29. Browser UMD Build
Se puede generar un bundle global `CTrackerSDK`:
1. Instalar dependencias en `api/`: `npm install` (ver package.json).
2. Ejecutar: `npm run build:umd`.
3. Incluir `dist/ctracker-sdk.umd.js` en `<script>` y usar `window.CTrackerSDK`.
---
## 34. Claim Parcial Percentual (claimPercentage Helper)
Se añadió el helper `claimPercentage` para simplificar reclamos parciales sin repetir lógica de cálculo:

Firma:
```
claimPercentage({
  referral,
  percentage,        // 1..100
  tokenOut?,         // address; si se setea => claimReferral token
  path?,             // array; si se setea => claimReferralPath
  minOut?,           // bigint min aceptable (token o path)
  recipient?         // address destino (default caller)
})
```
Reglas:
1. `percentage` entre 1 y 100.
2. Si se pasa `path` se ignora `tokenOut` (path tiene prioridad).
3. Si no se pasa `tokenOut` ni `path` => reclamo nativo.
4. `minOut` por ahora no se auto-calcula; calcularlo off-chain y pasarlo (futuro: integrarlo con quoting del router).

Ejemplos rápidos:
```js
// 40% nativo
await claimPercentage({ referral, percentage:40 });

// 50% a tokenOut usando conversión wNative->CTK
await claimPercentage({ referral, percentage:50, tokenOut: CTK, minOut: quoteMinusSlippage });

// 25% vía ruta multi-hop wNative->MID->CTK
await claimPercentage({ referral, percentage:25, path:[WBNB, MID, CTK], minOut: minOutCalc });
```

---
## 35. Support Matrix
| Category | Supported | Notes |
|----------|-----------|-------|
| Node Runtime | >= 18.x LTS | Uses modern ESM features in consumer code; SDK itself CommonJS compatible. |
| Ethers | 6.x | Typed definitions reference v6 BigInt returns. |
| Chains | Any EVM (BNB Chain, Ethereum, testnets) | Contracts must be deployed; env addresses required. |
| Bundlers | Webpack 5, Vite, Rollup, esbuild | For UMD build run provided script. |
| Frameworks | React, Next.js, plain JS | Hooks example provided; no framework coupling. |

## 36. Development Workflow
1. Clone & install: `npm ci`.
2. Lint (if added later): `npm run lint` (placeholder).
3. Build UMD: `npm run build:umd` (outputs `dist/`).
4. Local linking (optional): `npm pack` then install tarball in consuming app.
5. Increment version per SemVer (see Section 22) before publishing.

Branch strategy (suggested):
* `main` – stable, tagged releases.
* `dev` – integration of new helpers / docs.
* feature branches: `feat/<short-name>` -> PR -> squash merge.

Commit convention: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`) enabling automated changelog tooling in future.

## 37. Release & Version Promotion
1. Bump version in `package.json`.
2. Update unresolved sections / docs (TOC, FAQ if needed).
3. Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
4. Push tags: `git push --tags`.
5. Publish: `npm publish --access public`.
6. (Optional) Create GitHub Release with highlights (breaking changes, new helpers, internal).

## 38. Performance & Gas Considerations
| Aspect | Rationale | Recommendation |
|--------|-----------|----------------|
| Post‑swap balance reconciliation | Prevents inflated `amountOut` from routers | Accept slight gas overhead for integrity |
| Multi-level referral updates | O(levels) writes | Keep level count <=3 for bounded cost |
| Claim path conversion | External DEX path hop cost | Limit hops; pre‑quote off‑chain to avoid revert |
| Leftover tracking (model 2) | Provides accounting transparency | Periodically audit & optionally distribute |

Micro‑optimization ideas (roadmap):
* Batch claim for multiple users (gas sharing).
* Off-chain simulation caching of best path indexes.
* Tier snapshot compression (bit‑packing) if storage becomes dense.

## 39. Security Policy & Vulnerability Reporting
If you discover a vulnerability:
1. DO NOT open a public issue initially.
2. Email: security@ctracker.example (placeholder) or use GitHub private advisory.
3. Provide reproduction steps, impact assessment, suggested remediation.
4. Expect initial acknowledgment within 48h and fix timeline estimation within 5 business days.

Hardening checklist (internal):
* Static analysis (Slither / Mythril) on contract changes.
* Differential fuzzing for swap reconciliation logic.
* Event schema freeze to avoid downstream breaking analytics.

## 40. Changelog Policy
Changelog (if added) will contain sections per release: Added / Changed / Deprecated / Removed / Fixed / Security. Auto‑generated from Conventional Commits + manual curation for clarity.

## 41. FAQ
| Question | Answer |
|----------|--------|
| Why reconcile `amountOut` instead of trusting router quote? | Ensures truthful accounting vs sandwich / fee slippage manipulations. |
| Can I use only referral logic without swap? | Yes, but you'd need custom adapters; this SDK focuses on combined flow. |
| How to disable referrals temporarily? | Pass `referralModelId=0` and/or a zero referrer where contracts allow; pending stays intact. |
| How is percentage claim rounded? | Integer floor division on computed wei share. Leftover remains pending. |
| Where do tiers come from? | Future FeeManager snapshot logic; current param is forward‑compatible. |
| Why BigInt instead of BN.js? | Ethers v6 returns native BigInt—simpler, zero dependency overhead. |

## 42. Glossary
| Term | Definition |
|------|------------|
| Pending | Accrued, unclaimed native referral balance. |
| Claimable | Policy flag permitting user claim execution. |
| Referral Chain | Ordered addresses (L1..L3) receiving split percentages. |
| Leftover | Portion of referral fee not assigned due to empty chain slots. |
| Tier | Fee / reward bracket determined by volume or rules. |
| minOut | Minimum acceptable output tokens to guard against slippage. |

## 43. High-Level Architecture Diagram
```
┌──────────┐        swap()        ┌────────────────┐   emits    ┌──────────────┐
│  Frontend│ ───────────────────▶ │  CoreSwapV4     │ ─────────▶ │  Analytics    │
└─────┬────┘                      │  (routing +     │            │  Adapter (opt)│
  │                          │  reconciliation)│            └─────┬────────┘
  │ claim*                   └────────┬────────┘                  │ events
  ▼                                   │ referral fees              │
┌────────────┐  pending / claimable       ▼                           │
│  User /    │ ◀──────────────────────┌──────────────┐                │
│  Wallet    │                        │ ReferralEngine│◀ leftover ────┘
└────────────┘                        │ (multi-level) │
              └──────┬────────┘
                 │ storage (pending)
                 ▼
                ┌────────────┐
                │  Treasury  │ (optional fee sinks)
                └────────────┘
```

## 44. Acknowledgements
Inspired by prior work in on-chain referral & aggregation ecosystems. Thanks to contributors and auditors who improve safety & usability.

---
<p align="center"><sub>© C-Tracker – MIT Licensed. Contributions welcome.</sub></p>

Script de demo agregado:
```
npm run demo:claim:percentage
```
Variables de entorno relevantes:
```
CLAIM_PERCENT=50
CLAIM_MODE=native   # native | token | path
CLAIM_TOKEN_OUT=0x...  # requerido si CLAIM_MODE=token
CLAIM_PATH=0xWBNB,0xMID,0xCTK  # requerido si CLAIM_MODE=path
```

### parseTierRules
Helper opcional para transformar `TIER_RULES_JSON` (string) a array validado:
```js
const rules = parseTierRules(process.env.TIER_RULES_JSON);
const tier = determineRequestedTier(volume, rules);
```
Si el JSON es inválido retorna `[]` silenciosamente.

Buenas prácticas adicionales:
| Tema | Recomendación |
|------|---------------|
| Percentage grande | Evita 100% aquí; para full usa claimNative/claimToken/claimPath con amount=0 | 
| Cálculo minOut | Siempre deriva de un quote fresco (router / agregador) | 
| Reintentos | En caso de slippage, re-quotear antes de aumentar minOut | 
| Auditoría | Loggea porcentaje reclamado y txHash para conciliación | 


---
## 30. Type Checking / Dry Run
Scripts:
```bash
cd api
npm run typecheck   # tsc --noEmit para validar firmas
```

---
## 31. Ejemplo de Volumen -> Tier (Backend)
```ts
// pseudo volumen en native convertido a USD off-chain
const USD_VOLUME = BigInt(Math.floor(totalNativeUsdScaled));
const tierRules = [
  { minVolume: 0n, tier: 0 },
  { minVolume: 5_000n * 1_000_000n, tier: 1 },   // 5k USD (scaled 1e6)
  { minVolume: 50_000n * 1_000_000n, tier: 2 },  // 50k USD
  { minVolume: 250_000n * 1_000_000n, tier: 3 }  // 250k USD
];
const requestedTier = determineRequestedTier(USD_VOLUME, tierRules);
```

---
## 32. API Folder Standalone Usage
Este folder `api/` ahora incluye todo para que proyectos externos puedan probar sin tocar el root Hardhat:
1. `env.example` -> copiar como `.env`.
2. `npm install` dentro de `api/` (usa peer ethers desde root o instálalo si publicas).
3. Scripts de demo:
  - `npm run demo:quote` (requiere CORE_V4 / REFERRAL_V4 / WNATIVE_V4 / CTK_TOKEN / RPC_URL)
  - `npm run demo:claim:half` (requiere además REFERRER_PRIVATE_KEY y CLAIM_TOKEN_OUT opcional)
4. `loadApiConfig()` centraliza lectura de env.
5. `config.js` puede re-usarse en microservicios.

Variables mínimas para quote:
```
RPC_URL
CORE_V4
REFERRAL_V4
WNATIVE_V4
CTK_TOKEN
```

Variables extra para claim:
```
REFERRER_PRIVATE_KEY
CLAIM_PERCENT (opcional)
CLAIM_TOKEN_OUT (si distinto de CTK_TOKEN)
```

---

---
Happy building.

---
## 33. Path Swaps & Multi-Hop Claims
Además de los swaps automáticos por mejor ruta (`quoteBestPath`), puedes forzar una ruta específica:

Funciones expuestas:
```
swapETHForTokenPath({ core, path, amountInWei, expectedOut?, minOut?, slippageBps? })
swapTokenForTokenPath({ core, path, amountInWei, expectedOut?, minOut?, slippageBps? })
claimPath({ referral, path, amount, minOut, ... })
```

Requisitos:
1. `path.length >= 2`.
2. En claim path: `path[0] == wNative()` y `path[last]` token whitelisted.
3. `expectedOut` debe venir de un quote off-chain del router elegido; si lo pasas y no defines `minOut`, el helper aplicará `slippageBps` para derivar `minOut`.

Scripts de demo:
- `demo:swap:buy:path` (2 hops: WBNB->CTK)
- `demo:swap:buy:path:multi` (multi-hop: WBNB->INTERMEDIATE_TOKEN->CTK)
- `demo:claim:half:path` (claim 50% vía path WBNB->CTK)

Configuración multi-hop:
1. Define `INTERMEDIATE_TOKEN` en `.env`.
2. Asegura liquidez en ambos pares.
3. Ejecuta `npm run demo:swap:buy:path:multi`.

Buenas prácticas:
| Tema | Recomendación |
|------|---------------|
| Cálculo `expectedOut` | Usa SDK del DEX o llamada directa a router para simular | 
| Slippage | Ajusta por volatilidad: 500–1000 bps en test, menor en producción | 
| Validación path | Verifica addresses únicos y sin repetidos innecesarios | 
| MinOut | Nunca lo dejes en 0 en producción | 
| Monitoreo | Loggea ratio real vs esperado para alertas |

Fallback: si un path forzado da peor resultado que la ruta auto, considera comparar ambos antes de ejecutar.

