import { network } from "hardhat";
import { parseEther } from "viem";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🚀 Starting Akshayaa Swap deployment sequence...");

  const { viem, networkName } = await network.create();
  console.log(`Connected to network: ${networkName}`);

  const [deployer] = await viem.getWalletClients();
  console.log(`Deployer account: ${deployer.account.address}`);

  // 1. Deploy AkshayaaToken
  console.log("\nDeploying AkshayaaToken (AK)...");
  const token = await viem.deployContract("AkshayaaToken", [], {
    account: deployer.account,
  });
  console.log(`✅ AkshayaaToken deployed to: ${token.address}`);

  // 2. Deploy AkshayaaSwap
  console.log("\nDeploying AkshayaaSwap DEX Engine...");
  const swap = await viem.deployContract("AkshayaaSwap", [token.address], {
    account: deployer.account,
  });
  console.log(`✅ AkshayaaSwap Engine deployed to: ${swap.address}`);

  // 3. Seed Initial Liquidity Pool (20 AK + 2.0 ETH -> 1 ETH = 10 AK)
  const initialTokenAmount = parseEther("20");
  const initialEthAmount = parseEther("2.0");

  console.log("\n💧 Seeding Initial Liquidity Pool (20 AK + 2.0 ETH for 1 ETH = 10 AK)...");
  await token.write.approve([swap.address, initialTokenAmount], {
    account: deployer.account,
  });
  console.log("  Approved 20 AK tokens for AkshayaaSwap");

  await swap.write.addLiquidity([initialTokenAmount], {
    account: deployer.account,
    value: initialEthAmount,
  });
  console.log("  Added 20 AK + 2.0 ETH into the liquidity pool");

  const [tokenReserve, ethReserve, totalShares] = await swap.read.getPoolReserves();
  console.log(`✅ Initial Reserves: ${Number(tokenReserve) / 1e18} AK | ${Number(ethReserve) / 1e18} ETH (1 ETH = 10 AK)`);
  console.log(`   Total LP Shares: ${Number(totalShares) / 1e18}`);

  // 4. Export artifacts and addresses to frontend
  const frontendContractsDir = path.resolve(__dirname, "../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  const deployedAddressesFilePath = path.join(frontendContractsDir, "deployedAddresses.json");
  let existingAddresses = {};
  if (fs.existsSync(deployedAddressesFilePath)) {
    try {
      existingAddresses = JSON.parse(fs.readFileSync(deployedAddressesFilePath, "utf-8"));
    } catch (_) {}
  }

  const networkKey = networkName === "sepolia" ? "11155111" : "31337";
  const updatedNetworks = {
    ...(existingAddresses.networks || {}),
    [networkKey]: {
      name: networkName === "sepolia" ? "Ethereum Sepolia" : "Hardhat Localhost",
      chainId: networkName === "sepolia" ? 11155111 : 31337,
      tokenAddress: token.address,
      swapAddress: swap.address,
    },
  };

  const addresses = {
    ...existingAddresses,
    network: networkName,
    tokenAddress: token.address,
    swapAddress: swap.address,
    tokenSymbol: "AK",
    tokenName: "akshayaa",
    maxSupply: "100",
    initialSupply: "50",
    networks: updatedNetworks,
  };

  fs.writeFileSync(
    deployedAddressesFilePath,
    JSON.stringify(addresses, null, 2),
    "utf-8"
  );

  // Copy ABIs
  const tokenArtifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/AkshayaaToken.sol/AkshayaaToken.json"
  );
  const swapArtifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/AkshayaaSwap.sol/AkshayaaSwap.json"
  );

  if (fs.existsSync(tokenArtifactPath)) {
    const tokenArtifact = JSON.parse(fs.readFileSync(tokenArtifactPath, "utf-8"));
    fs.writeFileSync(
      path.join(frontendContractsDir, "AkshayaaTokenAbi.json"),
      JSON.stringify(tokenArtifact.abi, null, 2),
      "utf-8"
    );
  }

  if (fs.existsSync(swapArtifactPath)) {
    const swapArtifact = JSON.parse(fs.readFileSync(swapArtifactPath, "utf-8"));
    fs.writeFileSync(
      path.join(frontendContractsDir, "AkshayaaSwapAbi.json"),
      JSON.stringify(swapArtifact.abi, null, 2),
      "utf-8"
    );
  }

  console.log("\n📦 Contract addresses and ABIs exported to frontend/src/contracts/");
  console.log("🎉 Deployment & initialization complete!");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
