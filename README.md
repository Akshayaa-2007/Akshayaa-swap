# 🦄 AKSHAYAA SWAP — Decentralized Token Exchange & Liquidity Pool

A production-ready decentralized exchange (DEX) application built on Hardhat 3 and Viem for the **Akshayaa (AK) / ETH** pair, inspired by [saro-swap.vercel.app](https://saro-swap.vercel.app/).

---

## 🌟 Key Features

- **Constant-Product AMM (x * y = k):** Automated market maker pricing with 0.3% liquidity provider fee.
- **Liquidity Pool Operations:**
  - **Add Liquidity:** Proportional asset deposition (`ETH` and `AK`) with automated LP share minting.
  - **Remove Liquidity:** Percentage-based LP share burning with proportional asset redemption (`ETH` and `AK`).
- **Token Swapping:**
  - **Coin to Token:** Instant `ETH` $\rightarrow$ `AK` swap with slippage protection.
  - **Token to Coin:** Instant `AK` $\rightarrow$ `ETH` swap with two-step approval flow.
- **Akshayaa Token Economics:**
  - **Token Name:** `akshayaa`
  - **Token Symbol:** `AK`
  - **Max Supply:** `100 AK` ($100 \times 10^{18}$ wei)
  - **Initial Supply (50%):** Exactly `50 AK` minted to deployer / liquidity pool.
  - **Remaining Supply (50%):** Disbursed via the built-in decentralized testnet faucet (1 AK per claim).
- **Modern Saro-Swap Glassmorphic Interface:**
  - Dark / Light mode toggle with smooth theme transition.
  - Radial mesh background gradients and glowing accent cards.
  - Quick percentage selectors (25%, 50%, 75%, MAX).
  - Real-time price impact, slippage tolerance settings, and exchange rate calculation.
  - Wallet integration with MetaMask / Injected Web3 wallets.
  - Transaction success modal with confetti celebration.

---

## 📁 Project Structure

```
├── contracts/
│   ├── AkshayaaToken.sol     # ERC20 Token with 100 AK cap & Faucet
│   └── AkshayaaSwap.sol      # Constant-product AMM, LP shares & DEX engine
├── test/
│   └── AkshayaaSwap.ts       # Automated TypeScript + Viem test suite
├── scripts/
│   └── deploy.js             # Deployment, initial pool seeding & frontend exporter
├── frontend/
│   ├── src/
│   │   ├── contracts/        # Auto-generated contract ABIs & addresses
│   │   ├── useWeb3.js        # High-performance Viem Web3 wallet hook
│   │   ├── App.jsx           # Swap, Pool, Faucet & Analytics UI
│   │   ├── App.css           # Glassmorphic styles matching Saro-Swap
│   │   └── index.css         # Typography and design system tokens
│   └── package.json
└── hardhat.config.ts
```

---

## 🚀 Quick Start Guide

### 1. Run Automated Test Suite

Run all contract and integration tests:

```bash
npx hardhat test
```

### 2. Start Local Hardhat Blockchain Node

In a terminal window, start the local node (Chain ID: `31337`, RPC: `http://127.0.0.1:8545`):

```bash
npx hardhat node
```

### 3. Deploy Contracts & Seed Initial Liquidity on Sepolia

Set the Hardhat Sepolia configuration variables first. The deployer needs Sepolia ETH, and the RPC URL/private key must not be committed:

```powershell
$env:SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<project-id>"
$env:SEPOLIA_PRIVATE_KEY="0x..."
```

Then deploy `AkshayaaToken` and `AkshayaaSwap`, seed the AMM pool with 20 AK + 2 ETH, and export the Sepolia addresses/ABIs to the frontend:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

The script writes the deployed addresses to `frontend/src/contracts/deployedAddresses.json`. The frontend will only enable transactions when that file identifies `sepolia`, or when `VITE_TOKEN_ADDRESS` and `VITE_SWAP_ADDRESS` are provided in `frontend/.env`.

### 4. Launch Frontend Application

Navigate to `frontend/` and start the Vite development server:

```bash
cd frontend
npm run dev
```

Open your browser at `http://localhost:5173`, connect MetaMask to Sepolia, and use the **Liquidity** tab to approve AK and add an ETH/AK position through the constant-product AMM. Confirmed transactions include a direct Sepolia Etherscan link.

---

## 🦊 Connecting MetaMask to Localhost

1. In MetaMask, open **Settings** $\rightarrow$ **Networks** $\rightarrow$ **Add Network manually**.
2. Set:
   - **Network Name:** Hardhat Localhost
   - **New RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** `ETH`
3. Import the default Hardhat account:
   - **Private Key:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (Account #0)
