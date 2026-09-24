import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  createPublicClient, 
  createWalletClient, 
  custom, 
  http, 
  parseEther, 
  formatEther,
  isAddress 
} from 'viem';
import { hardhat, sepolia } from 'viem/chains';
import deployedInfo from './contracts/deployedAddresses.json';
import TokenAbi from './contracts/AkshayaaTokenAbi.json';
import SwapAbi from './contracts/AkshayaaSwapAbi.json';
import contractArtifacts from './contracts/contractArtifacts.json';

// Local chain definition matching Hardhat node
export const localChain = {
  ...hardhat,
  id: 31337,
  name: 'Hardhat Localhost',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
};

export const SUPPORTED_CHAINS = {
  11155111: {
    id: 11155111,
    name: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    chain: sepolia,
    rpcUrls: [import.meta.env.VITE_RENDER_RPC_URL || 'https://onrender.com'],
    explorerUrl: 'https://sepolia.etherscan.io',
    currency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  },
  31337: {
    id: 31337,
    name: 'Hardhat Localhost',
    shortName: 'Localhost',
    chain: localChain,
    rpcUrls: ['http://127.0.0.1:8545'],
    explorerUrl: '',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

const WALLET_CONNECTED_KEY = 'akshayaa_wallet_connected';
const PREFERRED_CHAIN_KEY = 'akshayaa_preferred_chain';
const SEPOLIA_TOKEN_KEY = 'akshayaa_sepolia_token_address';
const SEPOLIA_SWAP_KEY = 'akshayaa_sepolia_swap_address';

export function useWeb3() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Preferred network selection (defaults to Sepolia)
  const [preferredChainId, setPreferredChainId] = useState(() => {
    const saved = localStorage.getItem(PREFERRED_CHAIN_KEY);
    return saved ? parseInt(saved, 10) : 11155111;
  });

  // Sepolia custom addresses stored in localStorage
  const [sepoliaTokenAddr, setSepoliaTokenAddr] = useState(() => {
    return (
      localStorage.getItem(SEPOLIA_TOKEN_KEY) ||
      import.meta.env.VITE_SEPOLIA_TOKEN_ADDRESS ||
      deployedInfo.networks?.['11155111']?.tokenAddress ||
      ''
    );
  });

  const [sepoliaSwapAddr, setSepoliaSwapAddr] = useState(() => {
    return (
      localStorage.getItem(SEPOLIA_SWAP_KEY) ||
      import.meta.env.VITE_SEPOLIA_SWAP_ADDRESS ||
      deployedInfo.networks?.['11155111']?.swapAddress ||
      ''
    );
  });

  const [ethBalance, setEthBalance] = useState('0');
  const [akBalance, setAkBalance] = useState('0');
  const [tokenAllowance, setTokenAllowance] = useState('0');

  const [poolReserves, setPoolReserves] = useState({
    tokenReserve: 0n,
    ethReserve: 0n,
    totalShares: 0n,
  });
  const [userLpShares, setUserLpShares] = useState(0n);
  const [totalAkSupply, setTotalAkSupply] = useState('50');
  const [isContractValid, setIsContractValid] = useState(false);

  // Determine current effective chain ID
  const effectiveChainId = useMemo(() => {
    if (chainId && SUPPORTED_CHAINS[chainId]) {
      return chainId;
    }
    return preferredChainId;
  }, [chainId, preferredChainId]);

  const activeChainConfig = useMemo(() => {
    return SUPPORTED_CHAINS[effectiveChainId] || SUPPORTED_CHAINS[11155111];
  }, [effectiveChainId]);

  const activeChain = activeChainConfig.chain;

  // Active contract addresses based on active network
  const { tokenAddress, swapAddress } = useMemo(() => {
    if (activeChainConfig.id === 11155111) {
      return {
        tokenAddress: sepoliaTokenAddr,
        swapAddress: sepoliaSwapAddr,
      };
    }
    return {
      tokenAddress: deployedInfo.networks?.['31337']?.tokenAddress || deployedInfo.tokenAddress || '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9',
      swapAddress: deployedInfo.networks?.['31337']?.swapAddress || deployedInfo.swapAddress || '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707',
    };
  }, [activeChainConfig.id, sepoliaTokenAddr, sepoliaSwapAddr]);

  // Check if address is valid and NOT the user's own wallet address
  const hasBasicAddress = Boolean(
    tokenAddress && 
    isAddress(tokenAddress) && 
    swapAddress && 
    isAddress(swapAddress) &&
    (!account || (
      tokenAddress.toLowerCase() !== account.toLowerCase() &&
      swapAddress.toLowerCase() !== account.toLowerCase()
    ))
  );

  const hasContracts = Boolean(hasBasicAddress && isContractValid);

  const isUnsupportedChain = Boolean(
    account && chainId && !SUPPORTED_CHAINS[chainId]
  );

  // Set & persist Sepolia addresses
  const setSepoliaAddresses = useCallback((tokAddr, swpAddr) => {
    if (tokAddr) {
      localStorage.setItem(SEPOLIA_TOKEN_KEY, tokAddr);
      setSepoliaTokenAddr(tokAddr);
    } else {
      localStorage.removeItem(SEPOLIA_TOKEN_KEY);
      setSepoliaTokenAddr('');
    }
    if (swpAddr) {
      localStorage.setItem(SEPOLIA_SWAP_KEY, swpAddr);
      setSepoliaSwapAddr(swpAddr);
    } else {
      localStorage.removeItem(SEPOLIA_SWAP_KEY);
      setSepoliaSwapAddr('');
    }
  }, []);

  const clearSepoliaAddresses = useCallback(() => {
    localStorage.removeItem(SEPOLIA_TOKEN_KEY);
    localStorage.removeItem(SEPOLIA_SWAP_KEY);
    setSepoliaTokenAddr('');
    setSepoliaSwapAddr('');
    setIsContractValid(false);
  }, []);

  // Use the Render endpoint as the single HTTP JSON-RPC transport.
  const publicClient = useMemo(() => {
    return createPublicClient({
      chain: activeChain,
      transport: http(activeChainConfig.rpcUrls[0]),
    });
  }, [activeChain, activeChainConfig]);

  // Wallet client matching user's chain
  const getWalletClient = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No Web3 wallet found. Please install MetaMask or another Web3 extension.');
    }
    const clientChain = (chainId && SUPPORTED_CHAINS[chainId]) 
      ? SUPPORTED_CHAINS[chainId].chain 
      : activeChain;

    return createWalletClient({
      chain: clientChain,
      transport: custom(window.ethereum),
    });
  }, [chainId, activeChain]);

  // Check if contracts actually have bytecode on-chain
  useEffect(() => {
    let isCancelled = false;

    async function checkBytecode() {
      // If address matches user account or not an address, it's invalid
      if (!tokenAddress || !isAddress(tokenAddress) || (account && tokenAddress.toLowerCase() === account.toLowerCase())) {
        if (!isCancelled) setIsContractValid(false);
        return;
      }

      try {
        const code = await publicClient.getBytecode({ address: tokenAddress });
        if (!isCancelled) {
          if (code && code !== '0x') {
            setIsContractValid(true);
          } else {
            setIsContractValid(false);
            // If the user's stored address has no code, clean it up
            if (activeChainConfig.id === 11155111 && localStorage.getItem(SEPOLIA_TOKEN_KEY)) {
              console.warn('Configured Sepolia token has no contract bytecode on-chain. Cleaning up invalid address.');
              clearSepoliaAddresses();
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('Could not verify contract bytecode:', err.message);
          setIsContractValid(false);
        }
      }
    }

    checkBytecode();
    return () => { isCancelled = true; };
  }, [tokenAddress, account, publicClient, activeChainConfig.id, clearSepoliaAddresses]);

  // Refetch pool data
  const refetchPoolData = useCallback(async () => {
    if (!hasContracts) {
      setPoolReserves({ tokenReserve: 0n, ethReserve: 0n, totalShares: 0n });
      setTotalAkSupply('50');
      return;
    }
    try {
      const reserves = await publicClient.readContract({
        address: swapAddress,
        abi: SwapAbi,
        functionName: 'getPoolReserves',
      });
      setPoolReserves({
        tokenReserve: reserves[0],
        ethReserve: reserves[1],
        totalShares: reserves[2],
      });

      const supply = await publicClient.readContract({
        address: tokenAddress,
        abi: TokenAbi,
        functionName: 'totalSupply',
      });
      setTotalAkSupply(formatEther(supply));
    } catch (err) {
      console.warn('Could not read pool reserves from contract:', err.message);
    }
  }, [publicClient, swapAddress, tokenAddress, hasContracts]);

  // Refetch balances with direct wallet priority for 100% accuracy
  const refetchBalances = useCallback(async () => {
    if (!account) return;

    // 1. Native ETH balance: Direct from MetaMask wallet for instant accuracy
    let fetchedEth = false;
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const rawHex = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [account, 'latest'],
        });
        if (rawHex !== undefined && rawHex !== null) {
          const wei = BigInt(rawHex);
          setEthBalance(Number(formatEther(wei)).toFixed(4));
          fetchedEth = true;
        }
      } catch (directErr) {
        console.warn('Direct wallet getBalance failed, using publicClient fallback:', directErr.message);
      }
    }

    // Fallback ETH fetch via public client
    if (!fetchedEth) {
      try {
        const ethBal = await publicClient.getBalance({ address: account });
        setEthBalance(Number(formatEther(ethBal)).toFixed(4));
      } catch (err) {
        console.warn('publicClient getBalance failed:', err.message);
      }
    }

    // 2. Token & pool balances (if valid smart contracts exist on this network)
    if (hasContracts) {
      try {
        const akBal = await publicClient.readContract({
          address: tokenAddress,
          abi: TokenAbi,
          functionName: 'balanceOf',
          args: [account],
        });
        setAkBalance(Number(formatEther(akBal)).toFixed(4));

        const allowance = await publicClient.readContract({
          address: tokenAddress,
          abi: TokenAbi,
          functionName: 'allowance',
          args: [account, swapAddress],
        });
        setTokenAllowance(formatEther(allowance));

        const shares = await publicClient.readContract({
          address: swapAddress,
          abi: SwapAbi,
          functionName: 'liquidityShares',
          args: [account],
        });
        setUserLpShares(shares);
      } catch (tokErr) {
        console.warn('Error reading token balances:', tokErr.message);
      }
    } else {
      setAkBalance('0');
      setTokenAllowance('0');
      setUserLpShares(0n);
    }
  }, [account, publicClient, tokenAddress, swapAddress, hasContracts]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refetchPoolData(), refetchBalances()]);
  }, [refetchPoolData, refetchBalances]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask or Web3 wallet not detected. Please install a Web3 wallet extension.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        localStorage.setItem(WALLET_CONNECTED_KEY, 'true');
      }
      const currentChainHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainNum = parseInt(currentChainHex, 16);
      setChainId(currentChainNum);
      if (SUPPORTED_CHAINS[currentChainNum]) {
        setPreferredChainId(currentChainNum);
        localStorage.setItem(PREFERRED_CHAIN_KEY, currentChainNum.toString());
      }
    } catch (err) {
      setError(err.message || 'User rejected wallet connection');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setEthBalance('0');
    setAkBalance('0');
    setTokenAllowance('0');
    setUserLpShares(0n);
    localStorage.removeItem(WALLET_CONNECTED_KEY);

    if (window.ethereum && window.ethereum.request) {
      window.ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      }).catch(() => {});
    }
  }, []);

  // Switch network cleanly via MetaMask
  const switchNetwork = useCallback(async (targetChainId) => {
    if (!window.ethereum) return;
    const targetConfig = SUPPORTED_CHAINS[targetChainId];
    if (!targetConfig) return;

    const targetChainHex = '0x' + targetConfig.id.toString(16);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainHex }],
      });
      setChainId(targetConfig.id);
      setPreferredChainId(targetConfig.id);
      localStorage.setItem(PREFERRED_CHAIN_KEY, targetConfig.id.toString());
    } catch (switchError) {
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: targetChainHex,
                chainName: targetConfig.name,
                nativeCurrency: targetConfig.currency,
                rpcUrls: targetConfig.rpcUrls,
                blockExplorerUrls: targetConfig.explorerUrl ? [targetConfig.explorerUrl] : [],
              },
            ],
          });
          setChainId(targetConfig.id);
          setPreferredChainId(targetConfig.id);
          localStorage.setItem(PREFERRED_CHAIN_KEY, targetConfig.id.toString());
        } catch (addError) {
          console.error('Failed to add chain to wallet:', addError);
        }
      } else {
        console.error('Failed to switch chain:', switchError);
      }
    }
  }, []);

  // In-Browser 1-Click Sepolia Deployer
  const deployContractsToSepolia = useCallback(async (initialAk = '20', initialEth = '0.005') => {
    if (!account) throw new Error('Please connect your Web3 wallet first.');
    const walletClient = getWalletClient();

    // 1. Deploy AkshayaaToken (Max supply 100 AK, 50% minted initially to deployer)
    const tokenDeployHash = await walletClient.deployContract({
      abi: contractArtifacts.AkshayaaToken.abi,
      bytecode: contractArtifacts.AkshayaaToken.bytecode,
      account,
      args: [],
    });

    const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenDeployHash });
    const newTokenAddress = tokenReceipt.contractAddress;

    // 2. Deploy AkshayaaSwap with token address
    const swapDeployHash = await walletClient.deployContract({
      abi: contractArtifacts.AkshayaaSwap.abi,
      bytecode: contractArtifacts.AkshayaaSwap.bytecode,
      account,
      args: [newTokenAddress],
    });

    const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapDeployHash });
    const newSwapAddress = swapReceipt.contractAddress;

    // 3. Seed initial pool if requested
    if (parseFloat(initialEth) > 0 && parseFloat(initialAk) > 0) {
      try {
        const akAmountWei = parseEther(initialAk);
        const ethAmountWei = parseEther(initialEth);

        // Approve swap contract
        const approveHash = await walletClient.writeContract({
          address: newTokenAddress,
          abi: TokenAbi,
          functionName: 'approve',
          args: [newSwapAddress, akAmountWei],
          account,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Add liquidity to create constant-product pool
        const addLiqHash = await walletClient.writeContract({
          address: newSwapAddress,
          abi: SwapAbi,
          functionName: 'addLiquidity',
          args: [akAmountWei],
          value: ethAmountWei,
          account,
        });
        await publicClient.waitForTransactionReceipt({ hash: addLiqHash });
      } catch (poolErr) {
        console.warn('Initial pool seeding skipped/deferred:', poolErr.message);
      }
    }

    // Save and refresh
    setSepoliaAddresses(newTokenAddress, newSwapAddress);
    setIsContractValid(true);
    await refreshAll();

    return {
      tokenAddress: newTokenAddress,
      swapAddress: newSwapAddress,
    };
  }, [account, getWalletClient, publicClient, setSepoliaAddresses, refreshAll]);

  // Contract Action: Approve Token
  const approveToken = useCallback(
    async (amountEther) => {
      if (!hasContracts) throw new Error('Contracts not configured for this network');
      const walletClient = getWalletClient();
      const parsedAmount = parseEther(amountEther);
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TokenAbi,
        functionName: 'approve',
        args: [swapAddress, parsedAmount],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refetchBalances();
      return hash;
    },
    [account, getWalletClient, publicClient, refetchBalances, tokenAddress, swapAddress, hasContracts]
  );

  // Contract Action: Swap ETH to AK
  const swapEthToToken = useCallback(
    async (ethAmount, minTokensOut = '0') => {
      if (!hasContracts) throw new Error('Contracts not configured for this network');
      const walletClient = getWalletClient();
      const val = parseEther(ethAmount);
      const minTokens = parseEther(minTokensOut);
      const hash = await walletClient.writeContract({
        address: swapAddress,
        abi: SwapAbi,
        functionName: 'swapEthToToken',
        args: [minTokens],
        value: val,
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      await refreshAll();
      return { hash, receipt };
    },
    [account, getWalletClient, publicClient, refreshAll, swapAddress, hasContracts]
  );

  // Contract Action: Swap AK to ETH
  const swapTokenToEth = useCallback(
    async (tokenAmount, minEthOut = '0') => {
      if (!hasContracts) throw new Error('Contracts not configured for this network');
      const walletClient = getWalletClient();
      const tokensIn = parseEther(tokenAmount);
      const minEth = parseEther(minEthOut);
      const hash = await walletClient.writeContract({
        address: swapAddress,
        abi: SwapAbi,
        functionName: 'swapTokenToEth',
        args: [tokensIn, minEth],
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      await refreshAll();
      return { hash, receipt };
    },
    [account, getWalletClient, publicClient, refreshAll, swapAddress, hasContracts]
  );

  // Contract Action: Add Liquidity
  const addLiquidity = useCallback(
    async (ethAmount, tokenAmount) => {
      if (!hasContracts) throw new Error('Contracts not configured for this network');
      const walletClient = getWalletClient();
      const val = parseEther(ethAmount);
      const tokens = parseEther(tokenAmount);
      const hash = await walletClient.writeContract({
        address: swapAddress,
        abi: SwapAbi,
        functionName: 'addLiquidity',
        args: [tokens],
        value: val,
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      await refreshAll();
      return { hash, receipt };
    },
    [account, getWalletClient, publicClient, refreshAll, swapAddress, hasContracts]
  );

  // Contract Action: Remove Liquidity
  const removeLiquidity = useCallback(
    async (sharesToBurn) => {
      if (!hasContracts) throw new Error('Contracts not configured for this network');
      const walletClient = getWalletClient();
      const hash = await walletClient.writeContract({
        address: swapAddress,
        abi: SwapAbi,
        functionName: 'removeLiquidity',
        args: [sharesToBurn],
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      await refreshAll();
      return { hash, receipt };
    },
    [account, getWalletClient, publicClient, refreshAll, swapAddress, hasContracts]
  );

  // Contract Action: Claim Faucet
  const claimFaucet = useCallback(async () => {
    if (!account) {
      throw new Error('Please connect your Web3 wallet first.');
    }
    if (!hasContracts) {
      throw new Error(`AkshayaaToken is not deployed on ${activeChainConfig.name} yet. Click 'Deploy to Sepolia' to launch the contracts first!`);
    }
    const walletClient = getWalletClient();
    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: TokenAbi,
      functionName: 'faucet',
      args: [],
      account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await refreshAll();
    return { hash, receipt };
  }, [account, getWalletClient, publicClient, refreshAll, tokenAddress, hasContracts, activeChainConfig.name]);

  // Quote: ETH -> AK
  const getQuoteEthToAk = useCallback((ethIn) => {
    if (!ethIn || isNaN(parseFloat(ethIn)) || parseFloat(ethIn) <= 0) return '';
    try {
      const { tokenReserve, ethReserve } = poolReserves;
      if (tokenReserve === 0n || ethReserve === 0n) {
        const val = parseFloat(ethIn) * 10;
        return Number(val.toFixed(6)).toString();
      }
      const parsedIn = parseEther(ethIn);
      const amountInWithFee = parsedIn * 997n;
      const numerator = amountInWithFee * tokenReserve;
      const denominator = (ethReserve * 1000n) + amountInWithFee;
      const amountOut = numerator / denominator;
      return Number(parseFloat(formatEther(amountOut)).toFixed(6)).toString();
    } catch {
      return '';
    }
  }, [poolReserves]);

  // Quote: AK -> ETH
  const getQuoteAkToEth = useCallback((akIn) => {
    if (!akIn || isNaN(parseFloat(akIn)) || parseFloat(akIn) <= 0) return '';
    try {
      const { tokenReserve, ethReserve } = poolReserves;
      if (tokenReserve === 0n || ethReserve === 0n) {
        const val = parseFloat(akIn) / 10;
        return Number(val.toFixed(6)).toString();
      }
      const parsedIn = parseEther(akIn);
      const amountInWithFee = parsedIn * 997n;
      const numerator = amountInWithFee * ethReserve;
      const denominator = (tokenReserve * 1000n) + amountInWithFee;
      const amountOut = numerator / denominator;
      return Number(parseFloat(formatEther(amountOut)).toFixed(6)).toString();
    } catch {
      return '';
    }
  }, [poolReserves]);

  // Listen to wallet accounts and chain changes + auto-reconnect
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        localStorage.setItem(WALLET_CONNECTED_KEY, 'true');
      } else {
        disconnectWallet();
      }
    };

    const handleChainChanged = (newChainHex) => {
      const newChainNum = parseInt(newChainHex, 16);
      setChainId(newChainNum);
      if (SUPPORTED_CHAINS[newChainNum]) {
        setPreferredChainId(newChainNum);
        localStorage.setItem(PREFERRED_CHAIN_KEY, newChainNum.toString());
      }
      refreshAll();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    const wasConnected = localStorage.getItem(WALLET_CONNECTED_KEY) === 'true';
    if (wasConnected) {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          localStorage.removeItem(WALLET_CONNECTED_KEY);
        }
      }).catch(() => {});
    }

    window.ethereum.request({ method: 'eth_chainId' }).then((idHex) => {
      const idNum = parseInt(idHex, 16);
      setChainId(idNum);
      if (SUPPORTED_CHAINS[idNum]) {
        setPreferredChainId(idNum);
      }
    }).catch(() => {});

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [disconnectWallet, refreshAll]);

  // Initial and interval balance polling
  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 4000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  return {
    account,
    chainId: effectiveChainId,
    walletChainId: chainId,
    isConnecting,
    isConnected: !!account,
    isUnsupportedChain,
    error,
    ethBalance,
    akBalance,
    tokenAllowance,
    poolReserves,
    userLpShares,
    totalAkSupply,
    activeChain,
    activeChainConfig,
    tokenAddress,
    swapAddress,
    hasContracts,
    isContractValid,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    setSepoliaAddresses,
    clearSepoliaAddresses,
    deployContractsToSepolia,
    approveToken,
    swapEthToToken,
    swapTokenToEth,
    addLiquidity,
    removeLiquidity,
    claimFaucet,
    getQuoteEthToAk,
    getQuoteAkToEth,
    refreshAll,
  };
}
