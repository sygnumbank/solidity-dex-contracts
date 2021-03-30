/**
 * @title ISygnumToken
 * @notice Interface for custom functionality.
 */

pragma solidity 0.5.12;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract ISygnumToken is IERC20 {
    function block(address _account, uint256 _amount) external;

    function unblock(address _account, uint256 _amount) external;
}
