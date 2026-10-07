// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyGuard
 * @notice Onchain Risk & Policy Guard for Autonomous Trading Agents on Monad.
 * @dev Enforces deterministic non-negotiable risk limits onchain before transactions can execute on Kuru or Perpl.
 * Architecture:
 *   AI (Jev) Proposes -> Offchain Risk Gate Filters -> PolicyGuard Constrains Onchain -> Monad Executes.
 */
contract PolicyGuard {
    address public owner;
    address public authorizedAgent;
    bool public isPaused;

    uint256 public maxTransactionNotionalUsd;
    uint256 public maxDailyNotionalUsd;
    uint256 public currentDayNotionalSpent;
    uint256 public lastDayTimestamp;

    uint256 public executionNonce;

    mapping(address => bool) public allowedVenues;
    mapping(address => bool) public allowedTokens;

    event PolicyUpdated(uint256 maxTxNotional, uint256 maxDailyNotional);
    event VenueAllowanceChanged(address indexed venue, bool allowed);
    event TokenAllowanceChanged(address indexed token, bool allowed);
    event OrderExecuted(
        uint256 indexed nonce,
        address indexed agent,
        address indexed venue,
        address token,
        uint256 notionalUsd,
        bytes returnData
    );
    event EmergencyPaused(address indexed caller);
    event Unpaused(address indexed caller);
    event PolicyViolationBlocked(address indexed venue, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "PolicyGuard: caller is not owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == authorizedAgent || msg.sender == owner, "PolicyGuard: caller not authorized agent");
        _;
    }

    modifier whenNotPaused() {
        require(!isPaused, "PolicyGuard: trading execution is paused");
        _;
    }

    constructor(
        address _authorizedAgent,
        uint256 _maxTxNotionalUsd,
        uint256 _maxDailyNotionalUsd
    ) {
        owner = msg.sender;
        authorizedAgent = _authorizedAgent;
        maxTransactionNotionalUsd = _maxTxNotionalUsd;
        maxDailyNotionalUsd = _maxDailyNotionalUsd;
        lastDayTimestamp = block.timestamp;
    }

    /**
     * @notice Executes an action on an approved venue (Kuru or Perpl) if and only if all onchain policy constraints pass.
     */
    function executeConstrainedAction(
        address venue,
        address token,
        uint256 notionalUsd,
        bytes calldata callData
    ) external onlyAgent whenNotPaused returns (bytes memory) {
        require(allowedVenues[venue], "PolicyGuard: venue not approved in user policy");
        require(allowedTokens[token], "PolicyGuard: token not approved in user policy");
        require(notionalUsd <= maxTransactionNotionalUsd, "PolicyGuard: transaction exceeds maxTxNotional limit");

        // Roll over daily spend window if 24 hours elapsed
        if (block.timestamp >= lastDayTimestamp + 1 days) {
            currentDayNotionalSpent = 0;
            lastDayTimestamp = block.timestamp;
        }

        require(
            currentDayNotionalSpent + notionalUsd <= maxDailyNotionalUsd,
            "PolicyGuard: daily cumulative notional cap exceeded"
        );

        currentDayNotionalSpent += notionalUsd;
        uint256 currentNonce = ++executionNonce;

        // Perform external call to target venue
        (bool success, bytes memory returnData) = venue.call(callData);
        require(success, "PolicyGuard: execution call to venue failed");

        emit OrderExecuted(currentNonce, msg.sender, venue, token, notionalUsd, returnData);
        return returnData;
    }

    /**
     * @notice Emergency circuit breaker callable by either the owner or the autonomous agent.
     */
    function emergencyPause() external {
        require(msg.sender == owner || msg.sender == authorizedAgent, "PolicyGuard: unauthorized pause");
        isPaused = true;
        emit EmergencyPaused(msg.sender);
    }

    /**
     * @notice Resumes trading operations (only callable by human owner).
     */
    function unpause() external onlyOwner {
        isPaused = false;
        emit Unpaused(msg.sender);
    }

    function setVenue(address venue, bool allowed) external onlyOwner {
        allowedVenues[venue] = allowed;
        emit VenueAllowanceChanged(venue, allowed);
    }

    function setToken(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowanceChanged(token, allowed);
    }

    function updatePolicyLimits(uint256 _maxTxNotional, uint256 _maxDailyNotional) external onlyOwner {
        maxTransactionNotionalUsd = _maxTxNotional;
        maxDailyNotionalUsd = _maxDailyNotional;
        emit PolicyUpdated(_maxTxNotional, _maxDailyNotional);
    }

    function setAgent(address _agent) external onlyOwner {
        authorizedAgent = _agent;
    }
}
