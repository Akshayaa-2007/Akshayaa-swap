// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title AkshayaaToken
 * @dev ERC20 Token with max supply of 100 AK, 50% minted initially, and testnet faucet capability.
 */
contract AkshayaaToken is ERC20 {
    uint256 public constant MAX_SUPPLY = 100 * 10**18; // 100 AK
    uint256 public constant FAUCET_AMOUNT = 1 * 10**18; // 1 AK per faucet claim

    event FaucetClaimed(address indexed recipient, uint256 amount);

    constructor() ERC20("akshayaa", "AK") {
        // Mint exactly 50% of max supply to deployer (50 AK)
        _mint(msg.sender, MAX_SUPPLY / 2);
    }

    /**
     * @notice Allows any user to claim 1 AK test token from remaining 50% supply
     */
    function faucet() external returns (uint256) {
        require(totalSupply() + FAUCET_AMOUNT <= MAX_SUPPLY, "Faucet limit reached: MAX_SUPPLY minted");
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
        return FAUCET_AMOUNT;
    }

    /**
     * @notice Allows custom faucet claim amount up to 5 AK per call while respecting MAX_SUPPLY
     */
    function faucetCustom(uint256 amount) external returns (uint256) {
        require(amount > 0 && amount <= 5 * 10**18, "Invalid claim amount: between 0 and 5 AK");
        require(totalSupply() + amount <= MAX_SUPPLY, "Faucet limit reached: MAX_SUPPLY minted");
        _mint(msg.sender, amount);
        emit FaucetClaimed(msg.sender, amount);
        return amount;
    }
}
