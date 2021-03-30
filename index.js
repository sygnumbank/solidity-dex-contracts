const TruffleContract = require("@truffle/contract");

const exchangeJson = require("./build/contracts/Exchange.json");

module.exports = {
  load: (provider) => {
    const contracts = {
      Exchange: TruffleContract(exchangeJson),
    };
    Object.values(contracts).forEach((i) => i.setProvider(provider));
    return contracts;
  },
};
