/**
 * @title Exchange.
 * @author Team 3301 <team3301@sygnum.com>
 * @dev Users can make/cancel an order and take one or multiple orders.
 */

pragma solidity ^0.5.12;

import "../ISygnumToken.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";

import "@sygnum/solidity-base-contracts/contracts/helpers/Pausable.sol";
import "@sygnum/solidity-base-contracts/contracts/helpers/TradingPairWhitelist.sol";
import "@sygnum/solidity-base-contracts/contracts/helpers/instance/Whitelistable.sol";
import "@sygnum/solidity-base-contracts/contracts/helpers/Whitelist.sol";

contract Exchange is Pausable, TradingPairWhitelist {
    using Bytes32Set for Bytes32Set.Set;
    using SafeMath for uint256;
    using Math for uint256;

    struct Order {
        address maker; // account of the order maker.
        address specificTaker; // address of a taker, if applies.
        bool isComplete; // false: partial order; true: complete order;
        ISygnumToken sellToken; // token that the order maker sells
        uint256 sellAmount; // total amount of token planned to be sold by the maker
        ISygnumToken buyToken; // token that the order maker buys
        uint256 buyAmount; // total amount of token planned to be bought by the maker
    }

    Bytes32Set.Set internal orders;
    mapping(bytes32 => Order) public order;

    event MadeOrder(
        bytes32 indexed orderID,
        ISygnumToken indexed sellToken,
        ISygnumToken indexed buyToken,
        address maker,
        address specificTaker,
        bool isComplete,
        uint256 sellAmount,
        uint256 buyAmount
    );

    event MadeOrderParticipants(bytes32 indexed orderID, address indexed maker, address indexed specificTaker);

    event TakenOrder(
        bytes32 indexed orderID,
        ISygnumToken indexed purchasedToken,
        ISygnumToken indexed paidToken,
        address maker,
        address taker,
        uint256 purchasedAmount,
        uint256 paidAmount // computed amount of tokens paid by the taker
    );

    event TakenOrderParticipants(bytes32 indexed orderID, address indexed maker, address indexed taker);

    event CancelledOrder(
        bytes32 indexed orderID,
        address killer,
        ISygnumToken indexed sellToken,
        ISygnumToken indexed buyToken
    );

    /**
     * @dev Reverts if length is not within range
     */
    modifier checkBatchLength(uint256 length) {
        require(length > 1, "Exchange: Fewer than two orders");
        require(length < 256, "Exchange: Too many orders");
        _;
    }

    /**
     * @dev Reverts if current block less than time-out block number
     */
    modifier checkTimeOut(uint256 timeOutBlockNumber) {
        require(block.number <= timeOutBlockNumber, "Exchange: timeout");
        _;
    }

    /**
     * @dev Take orders by their orderID.
     * @param orderIDs Array of order ids to be taken.
     * @param buyers Array of buyers.
     * @param quantity Array of quantity per purchase.
     * @param timeOutBlockNumber Time-out block number.
     */
    function takeOrders(
        bytes32[] calldata orderIDs,
        address[] calldata buyers,
        uint256[] calldata quantity,
        uint256 timeOutBlockNumber
    ) external whenNotPaused checkBatchLength(orderIDs.length) checkTimeOut(timeOutBlockNumber) {
        require(
            orderIDs.length == buyers.length && buyers.length == quantity.length,
            "Exchange: orders and buyers not equal"
        );

        for (uint256 i = 0; i < orderIDs.length; i = i + 1) {
            takeOrder(orderIDs[i], buyers[i], quantity[i], timeOutBlockNumber);
        }
    }

    /**
     * @dev Cancel orders by their orderID.
     * @param orderIDs Array of order ids to be taken.
     */
    function cancelOrders(bytes32[] calldata orderIDs) external checkBatchLength(orderIDs.length) {
        for (uint256 i = 0; i < orderIDs.length; i = i + 1) {
            cancelOrder(orderIDs[i]);
        }
    }

    /**
     * @dev Let investor make an order, providing the approval is done beforehand.
     * @param isComplete If this order can be filled partially (by default), or can only been taken as a whole.
     * @param sellToken Address of the token to be sold in this order.
     * @param sellAmount Total amount of token that is planned to be sold in this order.
     * @param buyToken Address of the token to be purchased in this order.
     * @param buyAmount Total amount of token planned to be bought by the maker
     * @param timeOutBlockNumber Time-out block number.
     */
    function makeOrder(
        bytes32 orderID,
        address specificTaker, // if no one, just pass address(0)
        address seller,
        bool isComplete,
        ISygnumToken sellToken,
        uint256 sellAmount,
        ISygnumToken buyToken,
        uint256 buyAmount,
        uint256 timeOutBlockNumber
    )
        public
        whenNotPaused
        checkTimeOut(timeOutBlockNumber)
        onlyPaired(address(buyToken), address(sellToken))
        whenNotFrozen(address(buyToken), address(sellToken))
    {
        address _seller = isTrader(msg.sender) ? seller : msg.sender;
        _makeOrder(orderID, specificTaker, _seller, isComplete, sellToken, sellAmount, buyToken, buyAmount);
    }

    /**
     * @dev Take an order by its orderID.
     * @param orderID Order ID.
     * @param quantity The amount of 'sellToken' that the taker wants to purchase.
     * @param timeOutBlockNumber Time-out block number.
     */
    function takeOrder(
        bytes32 orderID,
        address seller,
        uint256 quantity,
        uint256 timeOutBlockNumber
    ) public whenNotPaused checkTimeOut(timeOutBlockNumber) {
        address _buyer = isTrader(msg.sender) ? seller : msg.sender;
        _takeOrder(orderID, _buyer, quantity);
    }

    /**
     * @dev Cancel an order by its maker or a trader.
     * @param orderID Order ID.
     */
    function cancelOrder(bytes32 orderID) public {
        require(orders.exists(orderID), "Exchange: order ID does not exist");
        Order memory theOrder = order[orderID];
        require(
            isTrader(msg.sender) || (isNotPaused() && theOrder.maker == msg.sender),
            "Exchange: not eligible to cancel this order or the exchange is paused"
        );
        theOrder.sellToken.unblock(theOrder.maker, theOrder.sellAmount);
        orders.remove(orderID);
        delete order[orderID];
        emit CancelledOrder(orderID, msg.sender, theOrder.sellToken, theOrder.buyToken);
    }

    /**
     * @dev Internal take order
     * @param orderID Order ID.
     * @param buyer Address of a seller, if applies.
     * @param quantity Amount to purchase.
     */
    function _takeOrder(
        bytes32 orderID,
        address buyer,
        uint256 quantity
    ) private {
        require(orders.exists(orderID), "Exchange: order ID does not exist");
        require(buyer != address(0), "Exchange: buyer cannot be set to an empty address");
        require(quantity > 0, "Exchange: quantity cannot be zero");
        Order memory theOrder = order[orderID];
        require(
            theOrder.specificTaker == address(0) || theOrder.specificTaker == buyer,
            "Exchange: not specific taker"
        );
        require(!isFrozen(address(theOrder.buyToken), address(theOrder.sellToken)), "Exchange: tokens are frozen");
        uint256 spend = 0;
        uint256 receive = 0;
        if (quantity >= theOrder.sellAmount) {
            // take the entire order anyway
            spend = theOrder.buyAmount;
            receive = theOrder.sellAmount;
            orders.remove(orderID);
            delete order[orderID];
        } else {
            // check if partial order is possible or not.
            require(!theOrder.isComplete, "Cannot take a complete order partially");
            spend = quantity.mul(theOrder.buyAmount).div(theOrder.sellAmount);
            receive = quantity;
            order[orderID].sellAmount = theOrder.sellAmount.sub(receive);
            order[orderID].buyAmount = theOrder.buyAmount.sub(spend);
        }

        require(
            theOrder.buyToken.allowance(buyer, address(this)) >= spend,
            "Exchange: sender buy allowance is not sufficient"
        );
        theOrder.buyToken.transferFrom(buyer, theOrder.maker, spend);

        require(
            theOrder.sellToken.allowance(theOrder.maker, address(this)) >= receive,
            "Exchange: allowance is greater than receiving"
        );
        theOrder.sellToken.unblock(theOrder.maker, receive);
        theOrder.sellToken.transferFrom(theOrder.maker, buyer, receive);
        emit TakenOrder(orderID, theOrder.buyToken, theOrder.sellToken, theOrder.maker, buyer, spend, receive);
        emit TakenOrderParticipants(orderID, theOrder.maker, buyer);
    }

    /**
     * @dev Internal make order
     * @param orderID Order ID.
     * @param specificTaker Address of a taker, if applies.
     * @param isComplete If this order can be filled partially, or can only been taken as a whole.
     * @param sellToken Address of the token to be sold in this order.
     * @param sellAmount Total amount of token that is planned to be sold in this order.
     * @param buyToken Address of the token to be purchased in this order.
     * @param buyAmount Total amount of token planned to be bought by the maker.
     */
    function _makeOrder(
        bytes32 orderID,
        address specificTaker,
        address seller,
        bool isComplete,
        ISygnumToken sellToken,
        uint256 sellAmount,
        ISygnumToken buyToken,
        uint256 buyAmount
    ) private {
        require(!orders.exists(orderID), "Exchange: order id already exists");
        require(specificTaker != msg.sender, "Exchange: Cannot make an order for oneself");
        require(sellAmount > 0, "Exchange: sell amount cannot be empty");
        require(buyAmount > 0, "Exchange: buy amount cannot be empty");

        require(sellToken.balanceOf(seller) >= sellAmount, "Exchange: seller does not have enough balance");
        require(
            sellToken.allowance(seller, address(this)) >= sellAmount,
            "Exchange: sell amount is greater than allowance"
        );
        require(
            Whitelist(Whitelistable(address(buyToken)).getWhitelistContract()).isWhitelisted(seller),
            "Exchange: seller is not on buy token whitelist"
        );

        if (specificTaker != address(0)) {
            require(
                Whitelist(Whitelistable(address(sellToken)).getWhitelistContract()).isWhitelisted(specificTaker),
                "Exchange: specific taker is not on sell token whitelist"
            );
        }

        sellToken.block(seller, sellAmount);

        order[orderID] = Order({
            maker: seller,
            specificTaker: specificTaker,
            isComplete: isComplete,
            sellToken: sellToken,
            sellAmount: sellAmount,
            buyToken: buyToken,
            buyAmount: buyAmount
        });
        orders.insert(orderID);
        emit MadeOrder(orderID, sellToken, buyToken, seller, specificTaker, isComplete, sellAmount, buyAmount);
        emit MadeOrderParticipants(orderID, seller, specificTaker);
    }

    /**
     * @return Amount of orders.
     */
    function getOrderCount() public view returns (uint256) {
        return orders.count();
    }

    /**
     * @return Key at index.
     */
    function getIdentifier(uint256 _index) public view returns (bytes32) {
        return orders.keyAtIndex(_index);
    }
}
