import { useState, useEffect, useCallback, useRef } from 'react';
import { useWeb3, SUPPORTED_CHAINS } from './useWeb3';
import { 
  ArrowDownUp, 
  RefreshCw, 
  Wallet, 
  Droplets, 
  Copy, 
  Check, 
  X, 
  ChevronDown, 
  ExternalLink, 
  Zap, 
  LogOut, 
  Sun, 
  Moon,
  Rocket,
  Settings,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { parseEther, formatEther } from 'viem';
import confetti from 'canvas-confetti';
import './App.css';

function App() {
  const {
    account,
    chainId,
    walletChainId,
    isConnecting,
    isConnected,
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
  } = useWeb3();

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('ak_theme') || 'dark');
  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('ak_theme', theme);
  }, [theme]);

  // Tabs: swap, pool, faucet
  const [activeTab, setActiveTab] = useState('swap');

  // Network dropdown menu
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const networkMenuRef = useRef(null);

  // Close network dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (networkMenuRef.current && !networkMenuRef.current.contains(e.target)) {
        setNetworkMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Swap state
  const [isEthToAk, setIsEthToAk] = useState(true);
  const [inputAmount, setInputAmount] = useState('');
  const [estimatedOut, setEstimatedOut] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [txStatus, setTxStatus] = useState(null); // { type: 'pending'|'success'|'error', msg, hash? }

  // Pool state
  const [poolMode, setPoolMode] = useState('add');
  const [poolEthAmount, setPoolEthAmount] = useState('');
  const [poolTokenAmount, setPoolTokenAmount] = useState('');
  const [removeSharesInput, setRemoveSharesInput] = useState('');

  // Faucet state
  const [isClaiming, setIsClaiming] = useState(false);

  // In-browser 1-click Sepolia deployer state
  const [isDeploying, setIsDeploying] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customTokenAddr, setCustomTokenAddr] = useState('');
  const [customSwapAddr, setCustomSwapAddr] = useState('');

  // Copy address
  const [copied, setCopied] = useState(false);

  // Success modal
  const [successModal, setSuccessModal] = useState(null);

  // Activity log
  const [activities, setActivities] = useState([]);

  // Auto quote estimation
  useEffect(() => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      setEstimatedOut('');
      return;
    }
    const quote = isEthToAk ? getQuoteEthToAk(inputAmount) : getQuoteAkToEth(inputAmount);
    setEstimatedOut(quote);
  }, [inputAmount, isEthToAk, getQuoteEthToAk, getQuoteAkToEth]);

  // Swap direction toggle
  const handleSwitch = () => {
    setIsEthToAk(!isEthToAk);
    setInputAmount('');
    setEstimatedOut('');
  };

  // Percentage handler (20%, 25%, 50%, 75%, 100%)
  const handlePercentage = (pct) => {
    const bal = isEthToAk ? parseFloat(ethBalance || '0') : parseFloat(akBalance || '0');
    if (bal <= 0) return;

    if (isEthToAk) {
      // Leave gas buffer for ETH
      const gasBuffer = pct === 1.0 ? 0.003 : 0.001;
      const target = Math.max(0, bal * pct - gasBuffer);
      setInputAmount(target > 0 ? target.toFixed(4) : '');
    } else {
      const target = bal * pct;
      setInputAmount(target > 0 ? target.toFixed(4) : '');
    }
  };

  const addActivity = (type, msg, hash) => {
    setActivities(prev => [{ type, msg, hash, time: new Date() }, ...prev].slice(0, 10));
  };

  // Execute swap
  const handleSwap = async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0 || !isConnected) return;
    setIsSwapping(true);
    setTxStatus({ type: 'pending', msg: 'Confirming swap transaction in wallet...' });
    try {
      let result;
      if (isEthToAk) {
        result = await swapEthToToken(inputAmount, '0');
      } else {
        const needed = parseEther(inputAmount);
        const current = parseEther(tokenAllowance || '0');
        if (current < needed) {
          setTxStatus({ type: 'pending', msg: 'Approving AK tokens...' });
          await approveToken(inputAmount);
        }
        setTxStatus({ type: 'pending', msg: 'Executing swap...' });
        result = await swapTokenToEth(inputAmount, '0');
      }

      const fromToken = isEthToAk ? 'ETH' : 'AK';
      const toToken = isEthToAk ? 'AK' : 'ETH';
      setTxStatus({ type: 'success', msg: 'Swap completed successfully!', hash: result.hash });
      addActivity('swap', `Swapped ${inputAmount} ${fromToken} → ${estimatedOut} ${toToken}`, result.hash);
      setSuccessModal({
        fromAmount: inputAmount,
        fromToken,
        toAmount: estimatedOut,
        toToken,
        hash: result.hash,
      });
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      setInputAmount('');
      setEstimatedOut('');
    } catch (err) {
      setTxStatus({ type: 'error', msg: err.shortMessage || err.message || 'Transaction failed' });
    } finally {
      setIsSwapping(false);
    }
  };

  // Add liquidity
  const handleAddLiquidity = async () => {
    if (!poolEthAmount || !poolTokenAmount || !isConnected) return;
    setTxStatus({ type: 'pending', msg: 'Approving AK tokens for pool...' });
    try {
      await approveToken(poolTokenAmount);
      setTxStatus({ type: 'pending', msg: 'Adding liquidity...' });
      const result = await addLiquidity(poolEthAmount, poolTokenAmount);
      setTxStatus({ type: 'success', msg: 'Liquidity added successfully!', hash: result.hash });
      addActivity('liquidity', `Added ${poolEthAmount} ETH + ${poolTokenAmount} AK`, result.hash);
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } });
      setPoolEthAmount('');
      setPoolTokenAmount('');
    } catch (err) {
      setTxStatus({ type: 'error', msg: err.shortMessage || err.message || 'Failed to add liquidity' });
    }
  };

  // Remove liquidity
  const handleRemoveLiquidity = async () => {
    if (!removeSharesInput || !isConnected) return;
    setTxStatus({ type: 'pending', msg: 'Removing liquidity...' });
    try {
      const shares = parseEther(removeSharesInput);
      const result = await removeLiquidity(shares);
      setTxStatus({ type: 'success', msg: 'Liquidity removed!', hash: result.hash });
      addActivity('liquidity', `Removed ${removeSharesInput} LP shares`, result.hash);
      setRemoveSharesInput('');
    } catch (err) {
      setTxStatus({ type: 'error', msg: err.shortMessage || err.message || 'Failed to remove liquidity' });
    }
  };

  // Claim faucet
  const handleFaucet = async () => {
    if (!isConnected) return;
    setIsClaiming(true);
    setTxStatus({ type: 'pending', msg: `Claiming 1 AK on ${activeChainConfig.name}...` });
    try {
      const result = await claimFaucet();
      setTxStatus({ type: 'success', msg: 'Claimed 1 AK token successfully!', hash: result.hash });
      addActivity('faucet', 'Claimed 1 AK from faucet', result.hash);
      confetti({ particleCount: 45, spread: 45, origin: { y: 0.6 } });
    } catch (err) {
      setTxStatus({ type: 'error', msg: err.shortMessage || err.message || 'Faucet claim failed' });
    } finally {
      setIsClaiming(false);
    }
  };

  // 1-Click Deploy to Sepolia
  const handleDeployToSepolia = async () => {
    if (!isConnected) {
      await connectWallet();
      return;
    }
    setIsDeploying(true);
    setTxStatus({ type: 'pending', msg: 'Deploying AkshayaaToken & Swap to Sepolia via MetaMask...' });
    try {
      const res = await deployContractsToSepolia('20', '0.005');
      setTxStatus({
        type: 'success',
        msg: `Deployed on Sepolia! Token: ${res.tokenAddress.slice(0, 8)}... | Pool: ${res.swapAddress.slice(0, 8)}...`,
      });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      setTxStatus({ type: 'error', msg: err.shortMessage || err.message || 'Deployment to Sepolia failed' });
    } finally {
      setIsDeploying(false);
    }
  };

  // Save custom addresses for Sepolia
  const handleSaveCustomAddresses = (e) => {
    e.preventDefault();
    if (customTokenAddr.trim() && customSwapAddr.trim()) {
      setSepoliaAddresses(customTokenAddr.trim(), customSwapAddr.trim());
      setShowConfigModal(false);
      setTxStatus({ type: 'success', msg: 'Contract addresses updated for Sepolia!' });
      refreshAll();
    }
  };

  // Copy address
  const handleCopy = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format address
  const shortAddr = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : '';

  // Network name
  const networkName = activeChainConfig?.name || 'Unknown Network';

  // Compute exchange rate from pool
  const exchangeRate = (() => {
    const { tokenReserve, ethReserve } = poolReserves;
    if (ethReserve === 0n || tokenReserve === 0n) return '10.0000';
    return (Number(formatEther(tokenReserve)) / Number(formatEther(ethReserve))).toFixed(4);
  })();

  // Auto-clear tx status
  useEffect(() => {
    if (txStatus && txStatus.type !== 'pending') {
      const t = setTimeout(() => setTxStatus(null), 8000);
      return () => clearTimeout(t);
    }
  }, [txStatus]);

  // Explorer link generator
  const getExplorerTxUrl = (hash) => {
    if (!hash) return null;
    if (activeChainConfig.explorerUrl) {
      return `${activeChainConfig.explorerUrl}/tx/${hash}`;
    }
    return null;
  };

  return (
    <div className={`app ${theme}`}>
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="logo" onClick={() => setActiveTab('swap')}>
          <div className="navbar-logo-img">
            <img src="/ak-logo.png" alt="AK Logo" />
          </div>
          <span className="brand-text">AKSHAYAA SWAP</span>
        </div>

        <span className="navbar-tagline">AK / ETH Decentralized Exchange</span>

        <div className="nav-actions">
          {/* THEME TOGGLE */}
          <button 
            className="theme-btn" 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
            title="Toggle Light/Dark Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* DYNAMIC NETWORK SELECTOR */}
          <div className="network-selector-wrapper" ref={networkMenuRef}>
            <button 
              className="network-selector-btn" 
              onClick={() => setNetworkMenuOpen(!networkMenuOpen)}
              title="Select / Switch Network"
            >
              <span className={`network-dot ${activeChainConfig.id === 11155111 ? 'sepolia-dot' : 'local-dot'}`} />
              <span>{activeChainConfig.shortName || activeChainConfig.name}</span>
              <ChevronDown size={14} className={`dropdown-chevron ${networkMenuOpen ? 'open' : ''}`} />
            </button>

            {networkMenuOpen && (
              <div className="network-dropdown-menu">
                <div className="dropdown-title">Select Network</div>
                {Object.values(SUPPORTED_CHAINS).map((chain) => (
                  <button
                    key={chain.id}
                    className={`network-dropdown-item ${activeChainConfig.id === chain.id ? 'active' : ''}`}
                    onClick={() => {
                      switchNetwork(chain.id);
                      setNetworkMenuOpen(false);
                    }}
                  >
                    <span className={`network-dot ${chain.id === 11155111 ? 'sepolia-dot' : 'local-dot'}`} />
                    <div className="network-item-info">
                      <span className="network-item-name">{chain.name}</span>
                      <span className="network-item-id">Chain ID: {chain.id}</span>
                    </div>
                    {activeChainConfig.id === chain.id && <Check size={14} className="active-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* WALLET BUTTON */}
          {isConnected ? (
            <button className="wallet-btn connected" onClick={disconnectWallet} title="Click to disconnect">
              <span className="wallet-addr">{shortAddr}</span>
              <span className="wallet-nav-bal">{ethBalance} ETH</span>
            </button>
          ) : (
            <button className="wallet-btn" onClick={connectWallet} disabled={isConnecting}>
              <Wallet size={15} />
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </nav>

      {/* MAIN */}
      <div className="main-content">
        {/* UNSUPPORTED CHAIN WARNING (Only if truly on an unknown chain like Mainnet/Polygon) */}
        {isUnsupportedChain && (
          <div className="network-warning-banner">
            <AlertCircle size={18} />
            <span>Unsupported network detected (Chain ID: {walletChainId}). Please switch to a supported network:</span>
            <div className="warning-actions">
              <button onClick={() => switchNetwork(11155111)}>Switch to Sepolia</button>
              <button onClick={() => switchNetwork(31337)}>Switch to Localhost</button>
            </div>
          </div>
        )}

        <div className="swap-grid-container">
          {/* LEFT COLUMN */}
          <div className="swap-main-column">
            {/* TAB NAVIGATION */}
            <div className="tab-navigation">
              <button className={`tab-btn ${activeTab === 'swap' ? 'active' : ''}`} onClick={() => setActiveTab('swap')}>
                <ArrowDownUp size={14} /> Swap
              </button>
              <button className={`tab-btn ${activeTab === 'pool' ? 'active' : ''}`} onClick={() => setActiveTab('pool')}>
                <Droplets size={14} /> Pool
              </button>
              <button className={`tab-btn ${activeTab === 'faucet' ? 'active' : ''}`} onClick={() => setActiveTab('faucet')}>
                <Zap size={14} /> Faucet
              </button>
            </div>

            {/* SEPOLIA CONTRACTS SETUP BANNER (When on Sepolia and contracts not yet configured) */}
            {activeChainConfig.id === 11155111 && !hasContracts && (
              <div className="sepolia-launch-banner">
                <div className="banner-left">
                  <div className="banner-badge">
                    <Sparkles size={13} /> Sepolia Testnet Ready
                  </div>
                  <h3>Launch Akshayaa DEX on Sepolia</h3>
                  <p>
                    Deploy your 100 supply AK token (50% minted) and AMM Liquidity Pool directly using your connected MetaMask wallet, or configure existing addresses.
                  </p>
                </div>
                <div className="banner-actions">
                  <button 
                    className="deploy-action-btn" 
                    onClick={handleDeployToSepolia} 
                    disabled={isDeploying || !isConnected}
                  >
                    <Rocket size={15} />
                    {isDeploying ? 'Deploying Contracts...' : '1-Click Deploy to Sepolia'}
                  </button>
                  <button 
                    className="config-action-btn" 
                    onClick={() => setShowConfigModal(true)}
                  >
                    <Settings size={14} /> Enter Addresses
                  </button>
                </div>
              </div>
            )}

            {/* SWAP TAB */}
            {activeTab === 'swap' && (
              <div className="swap-card">
                <div className="card-header">
                  <h2><ArrowDownUp size={18} /> Swap</h2>
                  <div className="header-badges">
                    <span className="network-badge">{networkName}</span>
                    {activeChainConfig.id === 11155111 && (
                      <button 
                        className="config-icon-btn" 
                        onClick={() => setShowConfigModal(true)} 
                        title="Configure Sepolia Contract Addresses"
                      >
                        <Settings size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* YOU PAY (FRONT SIDE INPUT) */}
                <div className="swap-box">
                  <div className="swap-header-row">
                    <span className="swap-label">You Pay</span>
                    <div className="balance-pill">
                      <span>Balance: <strong>{isEthToAk ? ethBalance : akBalance}</strong> {isEthToAk ? 'ETH' : 'AK'}</span>
                    </div>
                  </div>

                  <div className="input-row">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      min="0"
                      step="any"
                    />
                    <div className={`token-display ${isEthToAk ? 'eth' : 'ak'}`}>
                      {isEthToAk ? (
                        <span className="token-glyph">Ξ</span>
                      ) : (
                        <img src="/ak-logo.png" alt="AK" className="token-inline-logo" />
                      )}
                      <span>{isEthToAk ? 'ETH' : 'AK'}</span>
                    </div>
                  </div>

                  {/* PERCENTAGE BUTTONS: 20%, 25%, 50%, 75%, MAX */}
                  <div className="percentage-row">
                    <button type="button" onClick={() => handlePercentage(0.20)}>20%</button>
                    <button type="button" onClick={() => handlePercentage(0.25)}>25%</button>
                    <button type="button" onClick={() => handlePercentage(0.50)}>50%</button>
                    <button type="button" onClick={() => handlePercentage(0.75)}>75%</button>
                    <button type="button" className="max-pct-btn" onClick={() => handlePercentage(1.0)}>MAX</button>
                  </div>
                </div>

                {/* SWITCH DIRECTION BUTTON */}
                <div className="switch-button-wrapper">
                  <button className="switch-button" onClick={handleSwitch} title="Switch swap direction">
                    <ArrowDownUp size={16} />
                  </button>
                </div>

                {/* YOU RECEIVE (FRONT SIDE OUTPUT) */}
                <div className="swap-box">
                  <div className="swap-header-row">
                    <span className="swap-label">You Receive</span>
                    <div className="balance-pill">
                      <span>Balance: <strong>{isEthToAk ? akBalance : ethBalance}</strong> {isEthToAk ? 'AK' : 'ETH'}</span>
                    </div>
                  </div>

                  <div className="input-row">
                    <input
                      type="text"
                      placeholder="0.0"
                      value={estimatedOut}
                      readOnly
                    />
                    <div className={`token-display ${isEthToAk ? 'ak' : 'eth'}`}>
                      {isEthToAk ? (
                        <img src="/ak-logo.png" alt="AK" className="token-inline-logo" />
                      ) : (
                        <span className="token-glyph">Ξ</span>
                      )}
                      <span>{isEthToAk ? 'AK' : 'ETH'}</span>
                    </div>
                  </div>
                </div>

                {/* SWAP DETAILS */}
                {inputAmount && estimatedOut && (
                  <div className="swap-details">
                    <div className="details-title">
                      <span>Trade Details</span>
                      <span className="fee-badge">0.3% LP Fee</span>
                    </div>
                    <div className="detail-row">
                      <span>Exchange Rate</span>
                      <strong>1 ETH = {exchangeRate} AK</strong>
                    </div>
                    <div className="detail-row">
                      <span>Estimated Output</span>
                      <strong>{estimatedOut} {isEthToAk ? 'AK' : 'ETH'}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Price Impact</span>
                      <strong style={{ color: '#10b981' }}>{'< 0.1%'}</strong>
                    </div>
                  </div>
                )}

                {/* SWAP ACTION BUTTON */}
                {isConnected ? (
                  !hasContracts && activeChainConfig.id === 11155111 ? (
                    <button 
                      className="swap-button deploy-mode" 
                      onClick={handleDeployToSepolia} 
                      disabled={isDeploying}
                    >
                      <Rocket size={16} />
                      {isDeploying ? 'Deploying to Sepolia...' : 'Deploy Contracts to Sepolia First'}
                    </button>
                  ) : (
                    <button
                      className="swap-button"
                      disabled={!inputAmount || parseFloat(inputAmount) <= 0 || isSwapping}
                      onClick={handleSwap}
                    >
                      {isSwapping ? (
                        <><RefreshCw size={16} className="spin-icon" /> Processing Transaction...</>
                      ) : !inputAmount || parseFloat(inputAmount) <= 0 ? (
                        'Enter an amount'
                      ) : (
                        <>
                          <ArrowDownUp size={16} />
                          {!isEthToAk && parseFloat(tokenAllowance || '0') < parseFloat(inputAmount || '0')
                            ? 'Approve & Swap AK'
                            : 'Swap Now'}
                        </>
                      )}
                    </button>
                  )
                ) : (
                  <button className="swap-button" onClick={connectWallet} disabled={isConnecting}>
                    <Wallet size={16} />
                    {isConnecting ? 'Connecting...' : 'Connect Wallet to Swap'}
                  </button>
                )}

                {/* TX STATUS NOTIFICATION */}
                {txStatus && (
                  <div className={`status-message ${txStatus.type}`}>
                    {txStatus.type === 'pending' && <RefreshCw size={14} className="spin-icon" />}
                    {txStatus.type === 'success' && <Check size={14} />}
                    {txStatus.type === 'error' && <X size={14} />}
                    <span>{txStatus.msg}</span>
                    {txStatus.hash && getExplorerTxUrl(txStatus.hash) && (
                      <a 
                        href={getExplorerTxUrl(txStatus.hash)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="status-explorer-link"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* POOL TAB */}
            {activeTab === 'pool' && (
              <div className="swap-card">
                <div className="card-header">
                  <h2><Droplets size={18} /> Liquidity Pool</h2>
                  <span className="network-badge">{networkName}</span>
                </div>

                <div className="pool-stats-grid">
                  <div className="pool-stat-card">
                    <div className="stat-label">ETH Reserve</div>
                    <div className="stat-val">{Number(formatEther(poolReserves.ethReserve)).toFixed(4)}</div>
                  </div>
                  <div className="pool-stat-card">
                    <div className="stat-label">AK Reserve</div>
                    <div className="stat-val">{Number(formatEther(poolReserves.tokenReserve)).toFixed(4)}</div>
                  </div>
                  <div className="pool-stat-card">
                    <div className="stat-label">Total LP Shares</div>
                    <div className="stat-val">{Number(formatEther(poolReserves.totalShares)).toFixed(4)}</div>
                  </div>
                  <div className="pool-stat-card">
                    <div className="stat-label">Your LP Shares</div>
                    <div className="stat-val">{Number(formatEther(userLpShares)).toFixed(4)}</div>
                  </div>
                </div>

                <div className="pool-mode-selector">
                  <button 
                    className={`pool-mode-btn ${poolMode === 'add' ? 'active' : ''}`} 
                    onClick={() => setPoolMode('add')}
                  >
                    Add Liquidity
                  </button>
                  <button 
                    className={`pool-mode-btn ${poolMode === 'remove' ? 'active' : ''}`} 
                    onClick={() => setPoolMode('remove')}
                  >
                    Remove Liquidity
                  </button>
                </div>

                {poolMode === 'add' ? (
                  <>
                    <div className="swap-box" style={{ marginBottom: 10 }}>
                      <div className="swap-header-row">
                        <span className="swap-label">Deposit ETH</span>
                        <div className="balance-pill"><span>Bal: {ethBalance} ETH</span></div>
                      </div>
                      <div className="input-row">
                        <input 
                          type="number" 
                          placeholder="0.0" 
                          value={poolEthAmount} 
                          onChange={e => setPoolEthAmount(e.target.value)} 
                          min="0" 
                          step="any" 
                        />
                        <div className="token-display eth"><span className="token-glyph">Ξ</span>ETH</div>
                      </div>
                    </div>

                    <div className="swap-box">
                      <div className="swap-header-row">
                        <span className="swap-label">Deposit AK Token</span>
                        <div className="balance-pill"><span>Bal: {akBalance} AK</span></div>
                      </div>
                      <div className="input-row">
                        <input 
                          type="number" 
                          placeholder="0.0" 
                          value={poolTokenAmount} 
                          onChange={e => setPoolTokenAmount(e.target.value)} 
                          min="0" 
                          step="any" 
                        />
                        <div className="token-display ak">
                          <img src="/ak-logo.png" alt="AK" className="token-inline-logo" />
                          <span>AK</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className="swap-button" 
                      disabled={!poolEthAmount || !poolTokenAmount || !isConnected || !hasContracts} 
                      onClick={handleAddLiquidity}
                    >
                      <Droplets size={16} /> Add Liquidity to Pool
                    </button>
                  </>
                ) : (
                  <>
                    <div className="swap-box">
                      <div className="swap-header-row">
                        <span className="swap-label">LP Shares to Burn</span>
                        <div className="balance-pill">
                          <span>Your LP: {Number(formatEther(userLpShares)).toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="input-row">
                        <input 
                          type="number" 
                          placeholder="0.0" 
                          value={removeSharesInput} 
                          onChange={e => setRemoveSharesInput(e.target.value)} 
                          min="0" 
                          step="any" 
                        />
                        <div className="token-display">🔥 LP</div>
                      </div>
                      <div className="balance-row-small">
                        <button 
                          className="max-text" 
                          type="button" 
                          onClick={() => setRemoveSharesInput(formatEther(userLpShares))}
                        >
                          MAX SHARES
                        </button>
                      </div>
                    </div>

                    <button 
                      className="swap-button" 
                      disabled={!removeSharesInput || !isConnected || !hasContracts} 
                      onClick={handleRemoveLiquidity}
                    >
                      <LogOut size={16} /> Remove Liquidity & Claim Assets
                    </button>
                  </>
                )}

                {txStatus && (
                  <div className={`status-message ${txStatus.type}`}>
                    {txStatus.type === 'pending' && <RefreshCw size={14} className="spin-icon" />}
                    {txStatus.type === 'success' && <Check size={14} />}
                    {txStatus.type === 'error' && <X size={14} />}
                    <span>{txStatus.msg}</span>
                  </div>
                )}
              </div>
            )}

            {/* FAUCET TAB */}
            {activeTab === 'faucet' && (
              <div className="swap-card">
                <div className="card-header">
                  <h2><Zap size={18} /> Akshayaa (AK) Faucet</h2>
                  <span className="network-badge">{networkName}</span>
                </div>

                <div className="faucet-banner">
                  <div className="faucet-title">🚰 Claim Free AK Tokens on {networkName}</div>
                  <div className="faucet-desc">
                    Claim 1 AK token per transaction. Token max supply is 100 AK, 
                    with 50% minted initially and {totalAkSupply} AK total currently minted.
                    Fresh tokens are minted directly into your connected wallet.
                  </div>
                </div>

                <div className="pool-stats-grid">
                  <div className="pool-stat-card">
                    <div className="stat-label">Your AK Balance</div>
                    <div className="stat-val">{akBalance} AK</div>
                  </div>
                  <div className="pool-stat-card">
                    <div className="stat-label">Total Minted Supply</div>
                    <div className="stat-val">{Number(totalAkSupply).toFixed(2)} / 100</div>
                  </div>
                </div>

                {isConnected ? (
                  !hasContracts && activeChainConfig.id === 11155111 ? (
                    <button 
                      className="swap-button deploy-mode" 
                      onClick={handleDeployToSepolia} 
                      disabled={isDeploying}
                    >
                      <Rocket size={16} />
                      {isDeploying ? 'Deploying Contracts to Sepolia...' : 'Deploy Contracts to Sepolia to Enable Faucet'}
                    </button>
                  ) : (
                    <button 
                      className="swap-button" 
                      onClick={handleFaucet} 
                      disabled={isClaiming || !hasContracts}
                    >
                      {isClaiming ? (
                        <><RefreshCw size={16} className="spin-icon" /> Claiming 1 AK on {activeChainConfig.shortName}...</>
                      ) : !hasContracts ? (
                        'Deploy Contracts on this Network First'
                      ) : (
                        <><Zap size={16} /> Claim 1 AK Token</>
                      )}
                    </button>
                  )
                ) : (
                  <button className="swap-button" onClick={connectWallet} disabled={isConnecting}>
                    <Wallet size={16} /> Connect Wallet to Claim
                  </button>
                )}

                {txStatus && (
                  <div className={`status-message ${txStatus.type}`}>
                    {txStatus.type === 'pending' && <RefreshCw size={14} className="spin-icon" />}
                    {txStatus.type === 'success' && <Check size={14} />}
                    {txStatus.type === 'error' && <X size={14} />}
                    <span>{txStatus.msg}</span>
                    {txStatus.hash && getExplorerTxUrl(txStatus.hash) && (
                      <a 
                        href={getExplorerTxUrl(txStatus.hash)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="status-explorer-link"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="info-sidebar">
            {/* Wallet Card */}
            <div className="card">
              <div className="card-header-row">
                <Wallet size={15} />
                <h2>Connected Wallet</h2>
              </div>
              {isConnected ? (
                <>
                  <div className="connected-indicator">
                    <div className="live-dot" />
                    Connected to {activeChainConfig.name}
                  </div>
                  <div className="wallet-balance">
                    <div>
                      <span className="token-item-label"><span className="dot eth-dot" />Ethereum</span>
                      <strong>{ethBalance} ETH</strong>
                    </div>
                    <div>
                      <span className="token-item-label">
                        <img src="/ak-logo.png" alt="AK" className="sidebar-token-logo" />
                        Akshayaa
                      </span>
                      <strong>{akBalance} AK</strong>
                    </div>
                  </div>
                  <div className="address-box">
                    <span>{shortAddr}</span>
                    <button className="copy-btn" onClick={handleCopy} title="Copy Address">
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <button className="disconnect-card-btn" onClick={disconnectWallet}>
                    <LogOut size={12} style={{ marginRight: 6, verticalAlign: -2 }} />
                    Disconnect Wallet
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                    Connect your Web3 wallet on Sepolia or Localhost to swap AK tokens, view live balances, provide liquidity, or claim test tokens.
                  </p>
                  <button className="swap-button" onClick={connectWallet} disabled={isConnecting} style={{ marginTop: 0 }}>
                    <Wallet size={15} />
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </>
              )}
              {error && (
                <div className="status-message error" style={{ marginTop: 10 }}>
                  <X size={13} /> {error}
                </div>
              )}
            </div>

            {/* Pool Info Card */}
            <div className="card">
              <div className="card-header-row">
                <Droplets size={15} />
                <h2>Pool Overview</h2>
              </div>
              <div className="wallet-balance">
                <div>
                  <span className="token-item-label"><span className="dot eth-dot" />ETH Locked</span>
                  <strong>{Number(formatEther(poolReserves.ethReserve)).toFixed(4)}</strong>
                </div>
                <div>
                  <span className="token-item-label">
                    <img src="/ak-logo.png" alt="AK" className="sidebar-token-logo" />
                    AK Locked
                  </span>
                  <strong>{Number(formatEther(poolReserves.tokenReserve)).toFixed(4)}</strong>
                </div>
                <div>
                  <span className="token-item-label">Exchange Rate</span>
                  <strong>1 ETH = {exchangeRate} AK</strong>
                </div>
              </div>
            </div>

            {/* Contract Info Card */}
            <div className="card">
              <div className="card-header-row">
                <Sparkles size={15} />
                <h2>Token & Contract Details</h2>
              </div>
              <div className="wallet-balance">
                <div>
                  <span className="token-item-label">Active Chain</span>
                  <strong>{activeChainConfig.name}</strong>
                </div>
                <div>
                  <span className="token-item-label">Token Address</span>
                  <strong style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {hasContracts && tokenAddress ? `${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-6)}` : 'Not Deployed'}
                  </strong>
                </div>
                <div>
                  <span className="token-item-label">Swap Address</span>
                  <strong style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {hasContracts && swapAddress ? `${swapAddress.slice(0, 8)}...${swapAddress.slice(-6)}` : 'Not Deployed'}
                  </strong>
                </div>
                <div>
                  <span className="token-item-label">Status</span>
                  <strong style={{ color: hasContracts ? '#10b981' : '#f59e0b', fontSize: 12 }}>
                    {hasContracts ? 'Active & Verified' : 'Needs Deployment'}
                  </strong>
                </div>
              </div>
              {activeChainConfig.id === 11155111 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button 
                    className="deploy-action-btn" 
                    style={{ flex: 1, padding: '7px 10px', fontSize: 11, justifyContent: 'center' }}
                    onClick={handleDeployToSepolia}
                    disabled={isDeploying || !isConnected}
                  >
                    <Rocket size={12} /> {isDeploying ? 'Deploying...' : 'Deploy to Sepolia'}
                  </button>
                  <button 
                    className="config-action-btn" 
                    style={{ padding: '7px 10px', fontSize: 11 }}
                    onClick={clearSepoliaAddresses}
                    title="Reset addresses if invalid"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            {activities.length > 0 && (
              <div className="card">
                <div className="card-header-row">
                  <RefreshCw size={15} />
                  <h2>Recent Activity</h2>
                </div>
                {activities.map((a, i) => (
                  <div className="activity-item" key={i}>
                    <div>
                      <span className={`activity-badge ${a.type}`}>{a.type}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{a.msg}</span>
                    </div>
                    {a.hash && getExplorerTxUrl(a.hash) && (
                      <a 
                        className="etherscan-link" 
                        href={getExplorerTxUrl(a.hash)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        title="View on explorer"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SEPOLIA CUSTOM CONTRACT ADDRESS MODAL */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="config-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Configure Sepolia Contracts</h3>
              <button className="modal-close-btn" onClick={() => setShowConfigModal(false)}>✕</button>
            </div>
            <p className="modal-desc">
              Paste deployed contract addresses on Ethereum Sepolia or leave empty to deploy directly.
            </p>
            <form onSubmit={handleSaveCustomAddresses}>
              <div className="form-group">
                <label>Akshayaa Token (AK) Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={customTokenAddr}
                  onChange={e => setCustomTokenAddr(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>AkshayaaSwap DEX Pool Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={customSwapAddr}
                  onChange={e => setCustomSwapAddr(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowConfigModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Addresses</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SWAP SUCCESS MODAL */}
      {successModal && (
        <div className="modal-overlay" onClick={() => setSuccessModal(null)}>
          <div className="success-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSuccessModal(null)}>✕</button>
            <div className="success-icon-wrapper">
              <div className="success-icon-ring" />
              <div className="success-icon-circle">
                <Check size={28} color="#fff" />
              </div>
            </div>
            <h3 className="success-modal-title">Swap Successful!</h3>
            <p className="success-modal-subtitle">Your tokens have been swapped on {networkName}.</p>
            <div className="modal-swap-summary">
              <div className="summary-row">
                <span className="summary-label">Sent</span>
                <span className="summary-value"><strong>{successModal.fromAmount} {successModal.fromToken}</strong></span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Received</span>
                <span className="summary-value"><strong>{successModal.toAmount} {successModal.toToken}</strong></span>
              </div>
            </div>
            {successModal.hash && getExplorerTxUrl(successModal.hash) && (
              <a 
                className="etherscan-link" 
                href={getExplorerTxUrl(successModal.hash)} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                View on Explorer <ExternalLink size={12} />
              </a>
            )}
            <button className="modal-done-btn" onClick={() => setSuccessModal(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
