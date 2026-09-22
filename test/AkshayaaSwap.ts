import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther } from "viem";
import { network } from "hardhat";

describe("Akshayaa Swap & Token Test Suite", async function () {
  const { viem } = await network.create();
  const [owner, alice, bob] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  async function deployFixture() {
    const token = await viem.deployContract("AkshayaaToken", [], {
      account: owner.account,
    });
    const swap = await viem.deployContract("AkshayaaSwap", [token.address], {
      account: owner.account,
    });
    return { token, swap };
  }

  describe("AkshayaaToken Specifications", async function () {
    it("Should have correct name, symbol, and 50% initial supply minted", async function () {
      const { token } = await deployFixture();

      assert.equal(await token.read.name(), "akshayaa");
      assert.equal(await token.read.symbol(), "AK");

      const maxSupply = await token.read.MAX_SUPPLY();
      assert.equal(maxSupply, parseEther("100"));

      const totalSupply = await token.read.totalSupply();
      assert.equal(totalSupply, parseEther("50")); // 50% of 100

      const ownerBalance = await token.read.balanceOf([owner.account.address]);
      assert.equal(ownerBalance, parseEther("50"));
    });

    it("Should allow users to claim 1 AK test token from faucet", async function () {
      const { token } = await deployFixture();

      await token.write.faucet({ account: alice.account });
      const aliceBalance = await token.read.balanceOf([alice.account.address]);
      assert.equal(aliceBalance, parseEther("1"));

      const newTotalSupply = await token.read.totalSupply();
      assert.equal(newTotalSupply, parseEther("51"));
    });
  });

  describe("Liquidity Pool Operations", async function () {
    it("Should add initial liquidity and calculate reserves correctly", async function () {
      const { token, swap } = await deployFixture();

      // Owner approves swap contract for 20 AK
      const akLiquidity = parseEther("20");
      const ethLiquidity = parseEther("1");

      await token.write.approve([swap.address, akLiquidity], { account: owner.account });

      await swap.write.addLiquidity([akLiquidity], {
        account: owner.account,
        value: ethLiquidity,
      });

      const [tokenReserve, ethReserve, totalShares] = await swap.read.getPoolReserves();
      assert.equal(tokenReserve, akLiquidity);
      assert.equal(ethReserve, ethLiquidity);
      assert.equal(totalShares, ethLiquidity);

      const ownerShares = await swap.read.liquidityShares([owner.account.address]);
      assert.equal(ownerShares, ethLiquidity);
    });

    it("Should allow secondary liquidity additions at current ratio", async function () {
      const { token, swap } = await deployFixture();

      // Initial liquidity: 20 AK + 1 ETH (Ratio: 20 AK per 1 ETH)
      await token.write.approve([swap.address, parseEther("20")], { account: owner.account });
      await swap.write.addLiquidity([parseEther("20")], {
        account: owner.account,
        value: parseEther("1"),
      });

      // Alice claims 2 AK from faucetCustom and adds 0.1 ETH + 2 AK
      await token.write.faucetCustom([parseEther("2")], { account: alice.account });
      await token.write.approve([swap.address, parseEther("2")], { account: alice.account });

      await swap.write.addLiquidity([parseEther("2")], {
        account: alice.account,
        value: parseEther("0.1"),
      });

      const [tokenReserve, ethReserve, totalShares] = await swap.read.getPoolReserves();
      assert.equal(tokenReserve, parseEther("22"));
      assert.equal(ethReserve, parseEther("1.1"));
      assert.equal(totalShares, parseEther("1.1"));

      const aliceShares = await swap.read.liquidityShares([alice.account.address]);
      assert.equal(aliceShares, parseEther("0.1"));
    });

    it("Should allow removing liquidity and burn LP shares", async function () {
      const { token, swap } = await deployFixture();

      // Owner adds 20 AK + 1 ETH
      await token.write.approve([swap.address, parseEther("20")], { account: owner.account });
      await swap.write.addLiquidity([parseEther("20")], {
        account: owner.account,
        value: parseEther("1"),
      });

      const sharesBefore = await swap.read.liquidityShares([owner.account.address]);
      assert.equal(sharesBefore, parseEther("1"));

      // Remove 50% of shares (0.5 ETH worth)
      const sharesToRemove = parseEther("0.5");
      await swap.write.removeLiquidity([sharesToRemove], { account: owner.account });

      const [tokenReserve, ethReserve, totalShares] = await swap.read.getPoolReserves();
      assert.equal(tokenReserve, parseEther("10"));
      assert.equal(ethReserve, parseEther("0.5"));
      assert.equal(totalShares, parseEther("0.5"));
    });
  });

  describe("Token & Coin Swapping", async function () {
    it("Should swap ETH to AK token with 0.3% LP fee", async function () {
      const { token, swap } = await deployFixture();

      // Pool seeded with 25 AK + 0.5 ETH
      await token.write.approve([swap.address, parseEther("25")], { account: owner.account });
      await swap.write.addLiquidity([parseEther("25")], {
        account: owner.account,
        value: parseEther("0.5"),
      });

      // Bob swaps 0.05 ETH for AK tokens
      const ethIn = parseEther("0.05");
      const expectedAkOut = await swap.read.getQuoteEthToToken([ethIn]);
      assert(expectedAkOut > 0n, "Quote must be greater than 0");

      const bobAkBefore = await token.read.balanceOf([bob.account.address]);
      assert.equal(bobAkBefore, 0n);

      await swap.write.swapEthToToken([0n], {
        account: bob.account,
        value: ethIn,
      });

      const bobAkAfter = await token.read.balanceOf([bob.account.address]);
      assert.equal(bobAkAfter, expectedAkOut);

      // Verify pool reserves updated
      const [tokenReserve, ethReserve] = await swap.read.getPoolReserves();
      assert.equal(tokenReserve, parseEther("25") - expectedAkOut);
      assert.equal(ethReserve, parseEther("0.5") + ethIn);
    });

    it("Should swap AK token to ETH with 0.3% fee after approval", async function () {
      const { token, swap } = await deployFixture();

      // Seed pool with 25 AK + 0.5 ETH
      await token.write.approve([swap.address, parseEther("25")], { account: owner.account });
      await swap.write.addLiquidity([parseEther("25")], {
        account: owner.account,
        value: parseEther("0.5"),
      });

      // Alice claims 2 AK from faucet
      await token.write.faucetCustom([parseEther("2")], { account: alice.account });

      const akIn = parseEther("1");
      const expectedEthOut = await swap.read.getQuoteTokenToEth([akIn]);
      assert(expectedEthOut > 0n);

      // Alice approves swap contract
      await token.write.approve([swap.address, akIn], { account: alice.account });

      // Alice swaps 1 AK for ETH
      await swap.write.swapTokenToEth([akIn, 0n], {
        account: alice.account,
      });

      const aliceAkRemaining = await token.read.balanceOf([alice.account.address]);
      assert.equal(aliceAkRemaining, parseEther("1"));
    });

    it("Should revert swap if slippage minimum is not satisfied", async function () {
      const { token, swap } = await deployFixture();

      // Seed pool
      await token.write.approve([swap.address, parseEther("25")], { account: owner.account });
      await swap.write.addLiquidity([parseEther("25")], {
        account: owner.account,
        value: parseEther("0.5"),
      });

      // Try to swap 0.01 ETH demanding unrealistic 100 AK tokens out
      await viem.assertions.revertWith(
        swap.write.swapEthToToken([parseEther("100")], {
          account: bob.account,
          value: parseEther("0.01"),
        }),
        "Slippage tolerance exceeded",
      );
    });
  });
});
