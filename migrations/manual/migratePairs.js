// This scripts helps with migrating pairs from one DEX contract to another (old -> new).
// You must change oldAddress, newAddress and operatorAddress variables below.
// operatorPrivKey is optional and only needed if the operatorAddress is not controlled by the GOERLI_MNENOMIC_PHRASE
require("dotenv").config();

const oldAddress = "0x46c6d0F863664B1E605a21F0ccF0c6D5DBe094EF";
const newAddress = "0x1555e7E1c3486b435557D900a53B255d03D86274";
const operatorAddress = "0xaCD2AE13C39dd1eDEd24623017b07BfF045A9ebA";
const operatorPrivKey = process.env.OPERATOR_PRIVATE_KEY; // optional

const TruffleContract = require("@truffle/contract");
const HDWalletProvider = require("@truffle/hdwallet-provider");

const exchangeJson = require("../../build/contracts/Exchange.json");

const Exchange = TruffleContract(exchangeJson);
if (operatorPrivKey) {
  console.log("operatorPrivKey being used.");
  Exchange.setProvider(new HDWalletProvider([operatorPrivKey], process.env.GOERLI_PROVIDER, 0));
} else {
  Exchange.setProvider(new HDWalletProvider(process.env.GOERLI_MNENOMIC_PHRASE, process.env.GOERLI_PROVIDER));
}

(async function () {
  /*
  GET OLD PAIRS
  */
  const exchange = await Exchange.at(oldAddress);

  // Get all relevant events
  const pairedTokensEvents = await exchange.getPastEvents("PairedTokens", { fromBlock: 0, toBlock: "latest" });
  const depairedTokensEvents = await exchange.getPastEvents("DepairedTokens", { fromBlock: 0, toBlock: "latest" });
  const frozenPairsEvents = await exchange.getPastEvents("FrozenPair", { fromBlock: 0, toBlock: "latest" });
  const unfrozenPairsEvents = await exchange.getPastEvents("UnFrozenPair", { fromBlock: 0, toBlock: "latest" });

  console.log(`Got all old events from DEX contract at ${oldAddress}.`);

  // Remove all unpaired or tokens which were frozen and then unfrozen
  let pairedTokens = pairedTokensEvents.map((event) => {
    return { pairID: event.returnValues.pairID, buyToken: event.returnValues.buytoken, sellToken: event.returnValues.sellToken };
  });
  const depairedTokenIDs = depairedTokensEvents.map((event) => event.returnValues.pairID);
  pairedTokens = pairedTokens.filter((pair) => !depairedTokenIDs.includes(pair.pairID));

  let frozenPairIDs = frozenPairsEvents.map((event) => event.returnValues.pairID);
  const unfrozenPairIDs = unfrozenPairsEvents.map((event) => event.returnValues.pairID);
  frozenPairIDs = frozenPairIDs.filter((pairID) => !unfrozenPairIDs.includes(pairID));
  frozenPairIDs = frozenPairIDs.filter((pairID) => !depairedTokenIDs.includes(pairID));

  console.log("Assimilated all events.");
  // we now have pairedTokens containing all pairs which are currently paired
  // and frozenPairIDs contain all pair IDs which are currently frozen

  // just to ensure these are coming out in the correct order, avoid separate map functions
  const pairIDs = [];
  const buyTokens = [];
  const sellTokens = [];
  pairedTokens.forEach((pair) => {
    if (pair.pairID !== undefined && pair.buyToken !== undefined && pair.sellToken !== undefined) {
      pairIDs.push(pair.pairID);
      buyTokens.push(pair.buyToken);
      sellTokens.push(pair.sellToken);
    } else {
      console.error(`Found a pair with missing details. Exiting. Pair: ${JSON.stringify(pair)}`);
      process.exit(1);
    }
  });

  console.log("Assimilated all parameters.");
  // In order for the below to work, operatorAddress must be in the mnenomic derivation path
  // or, you must explicitly change `from` to an operator address and import the private key
  // instead, you could use the above outputs of pairIDs, buyTokens, sellTokens and frozenPairIDs
  // and then interact with your contract manually via Etherscan
  /*
  SET NEW PAIRS BASED ON OLD PAIRS GATHERED ABOVE
  */
  const newExchange = await Exchange.at(newAddress);

  try {
    console.log(`Updating new DEX contract at ${newAddress}.`);
    await newExchange.batchPairTokens(pairIDs, buyTokens, sellTokens, { from: operatorAddress });
    await newExchange.batchFreezeTokens(frozenPairIDs, { from: operatorAddress });
  } catch (e) {
    console.error(e);
  }

  console.log("Done.");
  process.exit(0);
})();
