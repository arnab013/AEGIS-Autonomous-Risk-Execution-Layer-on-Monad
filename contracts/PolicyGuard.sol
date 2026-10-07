// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IKuruNativeMarket {
    function getMarketParams() external view returns (
        uint32, uint96, address, uint256, address, uint256,
        uint32, uint96, uint96, uint256, uint256
    );
    function placeAndExecuteMarketSell(uint96 size, uint256 minAmountOut, bool isMargin, bool isFillOrKill)
        external payable returns (uint256);
}
interface IQuoteToken {
    function balanceOf(address user) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Optional funded vault with a narrowly scoped MON-to-USDC Kuru sell mandate.
/// @dev Limits are native wei, not agent-reported USD. No arbitrary calldata or token approvals.
///      The application does not claim this guard is deployed or controls the direct wallet path.
contract PolicyGuard {
    address public immutable owner;
    IKuruNativeMarket public immutable market;
    IQuoteToken public immutable quoteToken;
    uint96 public immutable sizePrecision;
    uint96 public immutable minSize;
    uint96 public immutable maxSize;
    address public authorizedAgent;
    bool public isPaused;
    bool private entered;
    uint256 public expiresAt;
    uint256 public maxTransactionWei;
    uint256 public maxDailyWei;
    uint256 public maxTotalWei;
    uint256 public totalSoldWei;
    uint256 public daySoldWei;
    uint256 public currentDay;
    uint256 public executionNonce;

    event MarketSellExecuted(uint256 indexed nonce, address indexed agent, uint96 size, uint256 spentWei, uint256 receivedQuote);
    event PolicyUpdated(uint256 maxTransactionWei, uint256 maxDailyWei, uint256 maxTotalWei, uint256 expiresAt);
    event AgentChanged(address indexed agent);
    event Paused(address indexed caller);
    event Unpaused(address indexed caller);

    modifier onlyOwner() { require(msg.sender == owner, "Owner only"); _; }
    modifier onlyAgent() { require(msg.sender == authorizedAgent || msg.sender == owner, "Agent only"); _; }
    modifier nonReentrant() { require(!entered, "Reentrancy blocked"); entered = true; _; entered = false; }

    constructor(address agent, address marketAddress, address quoteAddress,
        uint256 maxTx, uint256 maxDaily, uint256 maxTotal, uint256 expiry) {
        require(agent != address(0) && marketAddress.code.length > 0 && quoteAddress.code.length > 0, "Invalid deployment");
        owner = msg.sender;
        authorizedAgent = agent;
        market = IKuruNativeMarket(marketAddress);
        quoteToken = IQuoteToken(quoteAddress);
        (, uint96 precision, address base, uint256 baseDecimals, address quote, uint256 quoteDecimals,
            , uint96 minimum, uint96 maximum,,) = market.getMarketParams();
        require(base == address(0) && baseDecimals == 18 && quote == quoteAddress && quoteDecimals == 6, "Wrong market assets");
        require(precision > 0 && minimum > 0 && maximum >= minimum, "Wrong market precision");
        sizePrecision = precision;
        minSize = minimum;
        maxSize = maximum;
        currentDay = block.timestamp / 1 days;
        _setPolicy(maxTx, maxDaily, maxTotal, expiry);
    }

    receive() external payable onlyOwner {}

    /// @notice Agent may only sell exact native MON sizes through the immutable Kuru market.
    /// @dev FOK and direct USDC delivery are fixed. Output is measured from token balances.
    function executeMarketSell(uint96 size, uint256 minQuoteOut, uint256 deadline)
        external onlyAgent nonReentrant returns (uint256 receivedQuote) {
        require(!isPaused, "Execution paused");
        require(block.timestamp < expiresAt && block.timestamp <= deadline, "Mandate or proposal expired");
        require(size >= minSize && size <= maxSize && minQuoteOut > 0, "Invalid order limits");
        uint256 numerator = uint256(size) * 1 ether;
        require(numerator % sizePrecision == 0, "Non-exact native size");
        uint256 amountWei = numerator / sizePrecision;
        uint256 day = block.timestamp / 1 days;
        if (day != currentDay) { currentDay = day; daySoldWei = 0; }
        require(amountWei <= maxTransactionWei, "Transaction budget exceeded");
        require(daySoldWei + amountWei <= maxDailyWei, "Daily budget exceeded");
        require(totalSoldWei + amountWei <= maxTotalWei, "Total budget exceeded");
        require(address(this).balance >= amountWei, "Insufficient native funding");
        daySoldWei += amountWei;
        totalSoldWei += amountWei;
        uint256 nonce = ++executionNonce;
        uint256 beforeQuote = quoteToken.balanceOf(address(this));
        market.placeAndExecuteMarketSell{value: amountWei}(size, minQuoteOut, false, true);
        receivedQuote = quoteToken.balanceOf(address(this)) - beforeQuote;
        require(receivedQuote >= minQuoteOut, "Measured output below minimum");
        emit MarketSellExecuted(nonce, msg.sender, size, amountWei, receivedQuote);
    }

    function emergencyPause() external onlyAgent { isPaused = true; emit Paused(msg.sender); }
    function unpause() external onlyOwner { isPaused = false; emit Unpaused(msg.sender); }
    function setAgent(address agent) external onlyOwner { require(agent != address(0), "Invalid agent"); authorizedAgent = agent; emit AgentChanged(agent); }
    function updatePolicyLimits(uint256 maxTx, uint256 maxDaily, uint256 maxTotal, uint256 expiry) external onlyOwner {
        require(maxTotal >= totalSoldWei, "Total below spent");
        _setPolicy(maxTx, maxDaily, maxTotal, expiry);
    }
    function _setPolicy(uint256 maxTx, uint256 maxDaily, uint256 maxTotal, uint256 expiry) private {
        require(maxTx > 0 && maxDaily >= maxTx && maxTotal >= maxTx && expiry > block.timestamp, "Invalid policy");
        maxTransactionWei = maxTx; maxDailyWei = maxDaily; maxTotalWei = maxTotal; expiresAt = expiry;
        emit PolicyUpdated(maxTx, maxDaily, maxTotal, expiry);
    }
    function withdrawNative(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        (bool success,) = recipient.call{value: amount}(""); require(success, "Native withdrawal failed");
    }
    function withdrawQuote(address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient"); require(quoteToken.transfer(recipient, amount), "Quote withdrawal failed");
    }
}
