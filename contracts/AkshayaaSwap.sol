// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AkshayaaSwap
 * @notice Constant-product (x * y = k) AMM Liquidity Pool and Swap engine for AK / ETH.
 */
contract AkshayaaSwap is ReentrancyGuard {
    IERC20 public immutable token;
    uint256 public tokenReserve;
    uint256 public ethReserve;

    uint256 public totalLiquidityShares;
    mapping(address => uint256) public liquidityShares;

    event LiquidityAdded(address indexed provider, uint256 tokenAmount, uint256 ethAmount, uint256 sharesMinted);
    event LiquidityRemoved(address indexed provider, uint256 tokenAmount, uint256 ethAmount, uint256 sharesBurned);
    event Swapped(address indexed user, string path, uint256 inputAmount, uint256 outputAmount);

    constructor(address _tokenAddress) {
        require(_tokenAddress != address(0), "Invalid token address");
        token = IERC20(_tokenAddress);
    }

    /**
     * @notice AMM Constant-Product formula with 0.3% fee:
     *         dy = (dx * 997 * y) / (1000 * x + 997 * dx)
     */
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient pool liquidity");
        uint256 amountInWithFee = amountIn * 997; // 0.3% LP fee
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        return numerator / denominator;
    }

    /**
     * @notice Add liquidity to the AK/ETH pool
     * @param _tokenAmount Maximum tokens sender is willing to deposit
     */
    function addLiquidity(uint256 _tokenAmount) external payable nonReentrant returns (uint256 sharesMinted) {
        require(msg.value > 0, "ETH amount must be greater than zero");

        if (totalLiquidityShares == 0) {
            require(_tokenAmount > 0, "Token amount must be greater than zero");
            require(token.transferFrom(msg.sender, address(this), _tokenAmount), "Token transfer failed");

            tokenReserve = token.balanceOf(address(this));
            ethReserve = address(this).balance;

            // Initial shares equal to ETH deposited
            sharesMinted = msg.value;
            totalLiquidityShares = sharesMinted;
            liquidityShares[msg.sender] = sharesMinted;

            emit LiquidityAdded(msg.sender, _tokenAmount, msg.value, sharesMinted);
            return sharesMinted;
        } else {
            uint256 ethAmount = msg.value;
            // ethReserve before this msg.value deposit:
            uint256 previousEthReserve = ethReserve;
            uint256 tokenAmountCalculated = (ethAmount * tokenReserve) / previousEthReserve;
            require(_tokenAmount >= tokenAmountCalculated, "Insufficient AK tokens provided");

            require(token.transferFrom(msg.sender, address(this), tokenAmountCalculated), "Token transfer failed");

            sharesMinted = (ethAmount * totalLiquidityShares) / previousEthReserve;
            require(sharesMinted > 0, "Zero LP shares minted");

            totalLiquidityShares += sharesMinted;
            liquidityShares[msg.sender] += sharesMinted;

            tokenReserve = token.balanceOf(address(this));
            ethReserve = address(this).balance;

            emit LiquidityAdded(msg.sender, tokenAmountCalculated, ethAmount, sharesMinted);
            return sharesMinted;
        }
    }

    /**
     * @notice Remove liquidity by burning LP shares
     * @param _shares Number of LP shares to redeem
     */
    function removeLiquidity(uint256 _shares) external nonReentrant returns (uint256 tokenAmount, uint256 ethAmount) {
        require(_shares > 0 && _shares <= liquidityShares[msg.sender], "Invalid LP shares amount");

        ethAmount = (_shares * ethReserve) / totalLiquidityShares;
        tokenAmount = (_shares * tokenReserve) / totalLiquidityShares;
        require(ethAmount > 0 && tokenAmount > 0, "Insufficient liquidity redeemed");

        liquidityShares[msg.sender] -= _shares;
        totalLiquidityShares -= _shares;

        tokenReserve -= tokenAmount;
        ethReserve -= ethAmount;

        require(token.transfer(msg.sender, tokenAmount), "Token transfer failed");
        (bool success, ) = payable(msg.sender).call{value: ethAmount}("");
        require(success, "ETH transfer failed");

        emit LiquidityRemoved(msg.sender, tokenAmount, ethAmount, _shares);
        return (tokenAmount, ethAmount);
    }

    /**
     * @notice Swap ETH for AK tokens
     * @param minTokensOut Minimum AK tokens recipient must receive
     */
    function swapEthToToken(uint256 minTokensOut) external payable nonReentrant {
        require(msg.value > 0, "ETH amount must be greater than zero");
        require(ethReserve > 0 && tokenReserve > 0, "No pool liquidity");

        uint256 tokenAmountOut = getAmountOut(msg.value, ethReserve, tokenReserve);
        require(tokenAmountOut >= minTokensOut, "Slippage tolerance exceeded");
        require(tokenAmountOut <= tokenReserve, "Insufficient pool liquidity");

        tokenReserve -= tokenAmountOut;
        ethReserve += msg.value;

        require(token.transfer(msg.sender, tokenAmountOut), "Token transfer failed");
        emit Swapped(msg.sender, "ETH_TO_AK", msg.value, tokenAmountOut);
    }

    /**
     * @notice Swap AK tokens for ETH
     * @param _tokenAmountIn Amount of AK tokens sent
     * @param minEthOut Minimum ETH recipient must receive
     */
    function swapTokenToEth(uint256 _tokenAmountIn, uint256 minEthOut) external nonReentrant {
        require(_tokenAmountIn > 0, "Token amount must be greater than zero");
        require(ethReserve > 0 && tokenReserve > 0, "No pool liquidity");

        uint256 ethAmountOut = getAmountOut(_tokenAmountIn, tokenReserve, ethReserve);
        require(ethAmountOut >= minEthOut, "Slippage tolerance exceeded");
        require(ethAmountOut <= address(this).balance, "Insufficient pool liquidity");

        require(token.transferFrom(msg.sender, address(this), _tokenAmountIn), "Token receipt failed");

        tokenReserve = token.balanceOf(address(this));
        ethReserve -= ethAmountOut;

        (bool success, ) = payable(msg.sender).call{value: ethAmountOut}("");
        require(success, "ETH transfer failed");

        emit Swapped(msg.sender, "AK_TO_ETH", _tokenAmountIn, ethAmountOut);
    }

    // View helper quotes
    function getQuoteEthToToken(uint256 ethIn) external view returns (uint256) {
        if (ethReserve == 0 || tokenReserve == 0 || ethIn == 0) return 0;
        return getAmountOut(ethIn, ethReserve, tokenReserve);
    }

    function getQuoteTokenToEth(uint256 tokenIn) external view returns (uint256) {
        if (ethReserve == 0 || tokenReserve == 0 || tokenIn == 0) return 0;
        return getAmountOut(tokenIn, tokenReserve, ethReserve);
    }

    function getPoolReserves() external view returns (uint256 currentTokenReserve, uint256 currentEthReserve, uint256 totalShares) {
        return (tokenReserve, ethReserve, totalLiquidityShares);
    }
}
