const Exchange = artifacts.require("Exchange");

const { BASE_OPERATORS_CONTRACT_ADDRESS, TRADER_OPERATORS_CONTRACT_ADDRESS } = require("../config/deployment");

module.exports = function (deployer) {
  deployer.deploy(Exchange).then(function (exchange) {
    return exchange.initialize(BASE_OPERATORS_CONTRACT_ADDRESS, TRADER_OPERATORS_CONTRACT_ADDRESS);
  });
};
