// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TestQuoteToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Test balance");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}
interface ITestGuard { function executeMarketSell(uint96 size,uint256 minOut,uint256 deadline) external returns(uint256); }
contract TestKuruMarket {
    TestQuoteToken public quote;
    bool public shouldRevert;
    bool public shouldUnderpay;
    bool public attemptReentry;
    bool public reentrySucceeded;
    bool public lastIsMargin;
    bool public lastIsFOK;
    uint256 public lastValue;
    constructor(address token) { quote = TestQuoteToken(token); }
    function getMarketParams() external view returns(uint32,uint96,address,uint256,address,uint256,uint32,uint96,uint96,uint256,uint256) {
        return (1e8,1e10,address(0),18,address(quote),6,100,2e12,2e18,0,0);
    }
    function configure(bool failure,bool underpay,bool reentry) external { shouldRevert=failure;shouldUnderpay=underpay;attemptReentry=reentry; }
    function placeAndExecuteMarketSell(uint96 size,uint256 minOut,bool isMargin,bool isFOK) external payable returns(uint256) {
        require(!shouldRevert,"Test venue failure");
        lastIsMargin=isMargin;lastIsFOK=isFOK;lastValue=msg.value;
        if(attemptReentry) { (bool ok,)=msg.sender.call(abi.encodeCall(ITestGuard.executeMarketSell,(size,minOut,block.timestamp+60)));reentrySucceeded=ok; }
        uint256 output=uint256(size)*20000/1e10;
        quote.mint(msg.sender,shouldUnderpay?minOut-1:output);
        return output;
    }
    function invokeGuard(address guard,uint96 size,uint256 minOut,uint256 deadline) external { ITestGuard(guard).executeMarketSell(size,minOut,deadline); }
}
