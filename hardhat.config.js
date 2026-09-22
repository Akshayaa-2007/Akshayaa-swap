import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";

export default defineConfig({
  solidity: "0.8.24",
  plugins: [hardhatEthers],
  networks: {
    gochainTestnet: {
      type: "http",
      url: "https://thirdweb.com",
      accounts: ["YOUR_METAMASK_PRIVATE_KEY_HERE"] // ⚠️ Never commit this key to GitHub!
    }
  }
});
