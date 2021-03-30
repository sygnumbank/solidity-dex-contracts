const { constants, expectEvent, expectRevert } = require("@openzeppelin/test-helpers");

const { ZERO_ADDRESS } = constants;

const Exchange = artifacts.require("Exchange");

const CATEGORY = "0x74657374";
const CLASS_TOKEN = "A";

const THREE_IDENTIFIER = [
  "0x3b9a1d92c8d06bc35fb47d3befd591a98847f3777ccadd720b3804a0d2ba13c1",
  "0xa48bc95b481cc79317b530efb4f179774140aa8c97a820e0f1232a2af22444cf",
  "0x6f8c2b73c6bce177ccc25545b78312f763bbd374c56a4e7aefcb8186dcdaf319",
];

module.exports = {
  constants,
  expectEvent,
  expectRevert,
  ZERO_ADDRESS,
  Exchange,
  CATEGORY,
  CLASS_TOKEN,
  THREE_IDENTIFIER,
};
