const { load, THREE_HUNDRED_ADDRESS } = require("@sygnum/solidity-base-contracts");
const loadEquity = require("@sygnum/solidity-equity-token-contracts").load;
const { expectRevert, expectEvent, Exchange, ZERO_ADDRESS, CATEGORY, THREE_IDENTIFIER } = require("./common");
const cnf = require("../config/sygnum-token.json");

const { BaseOperators, TraderOperators, BlockerOperators, Whitelist } = load(Exchange.currentProvider);
const { SygnumToken } = loadEquity(Exchange.currentProvider);

contract("exchange", ([admin, operator, issuer, trader, traderMaker, maker, traderTaker, taker, specificTaker, attacker]) => {
  beforeEach("necessary before", async () => {
    this.baseOperators = await BaseOperators.new(admin, { from: admin });
    await this.baseOperators.addOperator(operator, { from: admin });

    this.traderOperators = await TraderOperators.new({ from: admin });
    await this.traderOperators.initialize(this.baseOperators.address, { from: admin });
    await this.traderOperators.addTrader(trader, { from: admin });

    this.blockerOperators = await BlockerOperators.new({ from: admin });
    await this.blockerOperators.initialize(this.baseOperators.address, { from: admin });

    this.whitelist = await Whitelist.new({ from: admin });
    await this.whitelist.initialize(this.baseOperators.address, { from: admin });

    this.exchange = await Exchange.new({ from: admin });
    await this.exchange.initialize(this.baseOperators.address, this.traderOperators.address, { from: admin });

    this.timeOutBlockNumber = (await web3.eth.getBlockNumber()) + 3000;
    this.half_ether = await web3.utils.toWei("0.5", "ether");
    this.one_ether = await web3.utils.toWei("1", "ether");
    this.ten_ether = await web3.utils.toWei("10", "ether");
  });

  context("when necessary", async () => {
    describe("token deployed", async () => {
      beforeEach(async () => {
        this.sellToken = await SygnumToken.new({ from: admin });
        this.buyToken = await SygnumToken.new({ from: admin });
        this.token3 = await SygnumToken.new({ from: admin });

        await this.sellToken.initializeContractsAndConstructor(
          cnf.name_1,
          cnf.symbol_1,
          cnf.decimals,
          CATEGORY,
          cnf.class_1,
          issuer,
          this.baseOperators.address,
          this.whitelist.address,
          this.traderOperators.address,
          this.blockerOperators.address,
          { from: admin }
        );
        await this.buyToken.initializeContractsAndConstructor(
          cnf.name_2,
          cnf.symbol_2,
          cnf.decimals,
          CATEGORY,
          cnf.class_2,
          issuer,
          this.baseOperators.address,
          this.whitelist.address,
          this.traderOperators.address,
          this.blockerOperators.address,
          { from: admin }
        );
        await this.token3.initializeContractsAndConstructor(
          cnf.name_3,
          cnf.symbol_3,
          cnf.decimals,
          CATEGORY,
          cnf.class_3,
          issuer,
          this.baseOperators.address,
          this.whitelist.address,
          this.traderOperators.address,
          this.blockerOperators.address,
          { from: admin }
        );

        await this.whitelist.toggleWhitelist(this.exchange.address, true, { from: operator });
      });
      describe("make order", async () => {
        describe("from user", async () => {
          it("revert when paused", async () => {
            beforeEach(async () => {
              await this.exchange.pause({ from: operator });
            });
            it("reverts", async () => {
              await expectRevert(
                this.exchange.makeOrder(
                  THREE_IDENTIFIER[0],
                  taker,
                  ZERO_ADDRESS,
                  true,
                  this.sellToken.address,
                  this.one_ether,
                  this.buyToken.address,
                  this.one_ether,
                  this.timeOutBlockNumber,
                  { from: maker }
                ),
                "Pausable: paused"
              );
            });
          });
          it("revert timeout ", async () => {
            beforeEach(async () => {
              this.invalidTime = (await web3.eth.getBlockNumber()) - 200;
            });
            it("reverts", async () => {
              await expectRevert(
                this.exchange.makeOrder(
                  THREE_IDENTIFIER[0],
                  taker,
                  ZERO_ADDRESS,
                  false,
                  this.sellToken.address,
                  this.one_ether,
                  this.buyToken.address,
                  this.one_ether,
                  this.invalidTime,
                  { from: maker }
                ),
                "Exchange: timeout"
              );
            });
          });
          it("revert when not paired", async () => {
            await expectRevert(
              this.exchange.makeOrder(
                THREE_IDENTIFIER[0],
                taker,
                ZERO_ADDRESS,
                true,
                this.sellToken.address,
                this.one_ether,
                this.buyToken.address,
                this.one_ether,
                this.timeOutBlockNumber,
                { from: maker }
              ),
              "TradingPairWhitelist: pair is not whitelisted"
            );
          });
          describe("is whitelisted", () => {
            beforeEach(async () => {
              await this.exchange.pairTokens(THREE_IDENTIFIER[0], this.buyToken.address, this.sellToken.address, { from: operator });
            });
            describe("is frozen", async () => {
              beforeEach(async () => {
                await this.exchange.freezePair(THREE_IDENTIFIER[0], { from: operator });
              });
              it("revert when frozen", async () => {
                await expectRevert(
                  this.exchange.makeOrder(
                    THREE_IDENTIFIER[0],
                    taker,
                    ZERO_ADDRESS,
                    true,
                    this.sellToken.address,
                    this.one_ether,
                    this.buyToken.address,
                    this.one_ether,
                    this.timeOutBlockNumber,
                    { from: maker }
                  ),
                  "TradingPairWhitelist: pair is frozen"
                );
              });
            });
            it("revert when same specific taker", async () => {
              await expectRevert(
                this.exchange.makeOrder(
                  THREE_IDENTIFIER[0],
                  maker,
                  ZERO_ADDRESS,
                  true,
                  this.sellToken.address,
                  this.one_ether,
                  this.buyToken.address,
                  this.one_ether,
                  this.timeOutBlockNumber,
                  { from: maker }
                ),
                "Exchange: Cannot make an order for oneself"
              );
            });
            it("revert when sell amount is equal to zero", async () => {
              await expectRevert(
                this.exchange.makeOrder(
                  THREE_IDENTIFIER[0],
                  specificTaker,
                  ZERO_ADDRESS,
                  true,
                  this.sellToken.address,
                  0,
                  this.buyToken.address,
                  this.one_ether,
                  this.timeOutBlockNumber,
                  { from: maker }
                ),
                "Exchange: sell amount cannot be empty"
              );
            });
            it("revert when buy amount is equal to zero", async () => {
              await expectRevert(
                this.exchange.makeOrder(
                  THREE_IDENTIFIER[0],
                  specificTaker,
                  ZERO_ADDRESS,
                  true,
                  this.sellToken.address,
                  this.one_ether,
                  this.buyToken.address,
                  0,
                  this.timeOutBlockNumber,
                  { from: maker }
                ),
                "Exchange: buy amount cannot be empty"
              );
            });
            it("revert when sell token balance is less than passed value", async () => {
              await expectRevert(
                this.exchange.makeOrder(
                  THREE_IDENTIFIER[0],
                  taker,
                  ZERO_ADDRESS,
                  true,
                  this.sellToken.address,
                  this.one_ether,
                  this.buyToken.address,
                  this.one_ether,
                  this.timeOutBlockNumber,
                  { from: maker }
                ),
                "Exchange: seller does not have enough balance"
              );
            });
            describe("account whitelisted on tokens", async () => {
              describe("on sell token", async () => {
                beforeEach(async () => {
                  await this.whitelist.toggleWhitelist(maker, true, { from: operator });
                });
                describe("when user has balance", async () => {
                  beforeEach(async () => {
                    await this.sellToken.mint(maker, this.one_ether, { from: operator });
                  });
                  it("revert when sell amount is greater than allowance", async () => {
                    await expectRevert(
                      this.exchange.makeOrder(
                        THREE_IDENTIFIER[0],
                        taker,
                        ZERO_ADDRESS,
                        false,
                        this.sellToken.address,
                        this.one_ether,
                        this.buyToken.address,
                        this.one_ether,
                        this.timeOutBlockNumber,
                        { from: maker }
                      ),
                      "Exchange: sell amount is greater than allowance"
                    );
                  });
                  describe("when approval is greater than sell amount", async () => {
                    beforeEach(async () => {
                      await this.sellToken.approve(this.exchange.address, this.one_ether, { from: maker });
                    });
                    describe("revert when maker is not whitelisted on buyToken", () => {
                      beforeEach(async () => {
                        this.newWhitelist = await Whitelist.new({ from: admin });
                        await this.newWhitelist.initialize(this.baseOperators.address, { from: admin });
                        await this.buyToken.setWhitelistContract(this.newWhitelist.address, { from: admin });
                        await this.newWhitelist.confirmFor(this.buyToken.address, { from: admin });
                      });
                      it("revert when not whitelisted buyToken", async () => {
                        await expectRevert(
                          this.exchange.makeOrder(
                            THREE_IDENTIFIER[0],
                            taker,
                            ZERO_ADDRESS,
                            false,
                            this.sellToken.address,
                            this.one_ether,
                            this.buyToken.address,
                            this.one_ether,
                            this.timeOutBlockNumber,
                            { from: maker }
                          ),
                          "Exchange: seller is not on buy token whitelist"
                        );
                      });
                    });
                    describe("when whitelisted on buy token", async () => {
                      beforeEach(async () => {
                        await this.whitelist.toggleWhitelist(taker, true, { from: operator });
                      });
                      describe("when exchange is blocker", () => {
                        beforeEach(async () => {
                          await this.blockerOperators.addBlocker(this.exchange.address, { from: operator });
                        });
                        it("revert when specific taker specified is not whitelisted on sell token", async () => {
                          await expectRevert(
                            this.exchange.makeOrder(
                              THREE_IDENTIFIER[0],
                              specificTaker,
                              ZERO_ADDRESS,
                              false,
                              this.sellToken.address,
                              this.one_ether,
                              this.buyToken.address,
                              this.one_ether,
                              this.timeOutBlockNumber,
                              { from: maker }
                            ),
                            "Exchange: specific taker is not on sell token whitelist"
                          );
                        });
                        describe("successful make order - no specific taker", () => {
                          describe("from user", () => {
                            beforeEach(async () => {
                              await this.exchange.makeOrder(
                                THREE_IDENTIFIER[0],
                                ZERO_ADDRESS,
                                ZERO_ADDRESS,
                                false,
                                this.sellToken.address,
                                this.one_ether,
                                this.buyToken.address,
                                this.one_ether,
                                this.timeOutBlockNumber,
                                { from: maker }
                              );
                            });
                            it("block has occurred", async () => {
                              assert.equal(await this.sellToken.blockedBalanceOf(maker), this.one_ether);
                            });
                            // it('order lookup', async () => {
                            //     console.log(await this.exchange.order(THREE_IDENTIFIER[0]))
                            // });
                            it("order length updated", async () => {
                              assert.equal(await this.exchange.getOrderCount(), 1);
                            });
                            it("inexchange updated", async () => {
                              assert.equal(await this.exchange.getIdentifier(0), THREE_IDENTIFIER[0]);
                            });
                            it("reverts when submitting with order ID already exists", async () => {
                              await expectRevert(
                                this.exchange.makeOrder(
                                  THREE_IDENTIFIER[0],
                                  ZERO_ADDRESS,
                                  ZERO_ADDRESS,
                                  false,
                                  this.sellToken.address,
                                  this.one_ether,
                                  this.buyToken.address,
                                  this.one_ether,
                                  this.timeOutBlockNumber,
                                  { from: maker }
                                ),
                                "Exchange: order id already exists"
                              );
                            });
                            context("cancel order", () => {
                              it("revert when order id does not exist", async () => {
                                await expectRevert(this.exchange.cancelOrder(THREE_IDENTIFIER[1], { from: maker }), "Exchange: order ID does not exist");
                              });
                              it("revert when not order maker", async () => {
                                await expectRevert(
                                  this.exchange.cancelOrder(THREE_IDENTIFIER[0], { from: attacker }),
                                  "Exchange: not eligible to cancel this order or the exchange is paused"
                                );
                              });
                              describe("cancel order correctly", () => {
                                beforeEach(async () => {
                                  await this.exchange.cancelOrder(THREE_IDENTIFIER[0], { from: maker });
                                });
                                it("order removed", async () => {
                                  assert.equal(await this.exchange.getOrderCount(), 0);
                                });
                                // it('order removed', async () => {
                                //     console.log(await this.exchange.order(THREE_IDENTIFIER[0]))
                                // });
                                it("blocked balance updated", async () => {
                                  assert.equal(await this.sellToken.blockedBalanceOf(taker), 0);
                                });
                                it("unblocked balance updated", async () => {
                                  assert.equal(await this.sellToken.balanceOf(maker), this.one_ether);
                                });
                              });
                            });
                            describe("take order", () => {
                              it("revert when order ID does not exist", async () => {
                                await expectRevert(
                                  this.exchange.takeOrder(THREE_IDENTIFIER[1], ZERO_ADDRESS, this.one_ether, this.timeOutBlockNumber, { from: taker }),
                                  "Exchange: order ID does not exist"
                                );
                              });
                              it("revert when quantity is equal to zero", async () => {
                                await expectRevert(
                                  this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, 0, this.timeOutBlockNumber, { from: taker }),
                                  "Exchange: quantity cannot be zero"
                                );
                              });
                              describe("when pair is frozen", async () => {
                                beforeEach(async () => {
                                  await this.exchange.freezePair(THREE_IDENTIFIER[0], { from: operator });
                                });
                                it("revert when frozen", async () => {
                                  await expectRevert(
                                    this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, this.one_ether, this.timeOutBlockNumber, { from: taker }),
                                    "Exchange: tokens are frozen"
                                  );
                                });
                              });
                              it("revert when buyer has not approved sell token", async () => {
                                await expectRevert(
                                  this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, this.one_ether, this.timeOutBlockNumber, { from: taker }),
                                  "Exchange: sender buy allowance is not sufficient"
                                );
                              });
                              describe("when buyer has balance, and approval", () => {
                                beforeEach(async () => {
                                  await this.buyToken.mint(taker, this.one_ether, { from: operator });
                                  await this.buyToken.approve(this.exchange.address, this.one_ether, { from: taker });
                                });
                                // describe('when seller decreases approval', () => {
                                //     beforeEach(async () => {
                                //         await this.sellToken.decreaseAllowance(this.exchange, this.one_ether, { from: taker })
                                //     });
                                //     it('revert when allowance less than order value', async () => {
                                //         await expectRevert(this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, this.one_ether, this.timeOutBlockNumber, { from: taker }), 'Exchange: sell token amount is greater than allowance')
                                //     });
                                // });
                                describe("takeOrder - correctly takes full amount", () => {
                                  beforeEach(async () => {
                                    this.tx = await this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, this.one_ether, this.timeOutBlockNumber, {
                                      from: taker,
                                    });
                                  });
                                  it("should have emitted TakenOrder and TakenOrderParticipants events", async () => {
                                    expectEvent(this.tx, "TakenOrder");
                                    expectEvent(this.tx, "TakenOrderParticipants");
                                  });
                                  describe("buy token", () => {
                                    it("taker balance updated", async () => {
                                      assert.equal(await this.buyToken.balanceOf(taker), 0);
                                    });
                                    it("maker balance updated", async () => {
                                      assert.equal(await this.buyToken.balanceOf(maker), this.one_ether);
                                    });
                                  });
                                  describe("sell token", () => {
                                    it("taker balance updated", async () => {
                                      assert.equal(await this.sellToken.balanceOf(taker), this.one_ether);
                                    });
                                    it("maker balance updated", async () => {
                                      assert.equal(await this.sellToken.balanceOf(maker), 0);
                                    });
                                  });
                                  it("blocked balance updated", async () => {
                                    assert.equal(await this.sellToken.blockedBalanceOf(maker), 0);
                                  });
                                });
                                describe("takeOrder - correctly takes partial amount", () => {
                                  beforeEach(async () => {
                                    await this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, this.half_ether, this.timeOutBlockNumber, { from: taker });
                                  });
                                  describe("buy token", () => {
                                    it("taker balance updated", async () => {
                                      assert.equal(await this.buyToken.balanceOf(taker), this.half_ether);
                                    });
                                    it("maker balance updated", async () => {
                                      assert.equal(await this.buyToken.balanceOf(maker), this.half_ether);
                                    });
                                  });
                                  describe("sell token", () => {
                                    it("maker balance updated", async () => {
                                      assert.equal(await this.sellToken.balanceOf(taker), this.half_ether);
                                    });
                                  });
                                  it("blocked balance updated", async () => {
                                    assert.equal(await this.sellToken.blockedBalanceOf(maker), this.half_ether);
                                  });
                                });
                              });
                            });
                          });
                        });
                        describe("make order - specific taker", () => {
                          describe("from user", () => {
                            beforeEach(async () => {
                              await this.exchange.makeOrder(
                                THREE_IDENTIFIER[0],
                                taker,
                                ZERO_ADDRESS,
                                false,
                                this.sellToken.address,
                                this.one_ether,
                                this.buyToken.address,
                                this.one_ether,
                                this.timeOutBlockNumber,
                                { from: maker }
                              );
                            });
                            it("when taker has balance", () => {
                              beforeEach(async () => {
                                await this.buyToken.mint(taker, this.one_ether, { from: operator });
                                await this.buyToken.approve(this.exchange.address, this.one_ether, { from: taker });
                              });
                              it("when specified taker is whitelisted", () => {
                                beforeEach(async () => {
                                  await this.whitelist.toggleWhitelist(this.exchange.address, true, { from: operator });
                                });
                                it("revert if taker is not specified taker", async () => {
                                  await expectRevert(
                                    await this.exchange.takeOrder(THREE_IDENTIFIER[0], ZERO_ADDRESS, this.one_ether, this.timeOutBlockNumber, {
                                      from: specificTaker,
                                    }),
                                    "Exchange: not specific taker"
                                  );
                                });
                              });
                            });
                          });
                        });
                        describe("make order - from trader", () => {
                          describe("when whitelisted", () => {
                            beforeEach(async () => {
                              await this.whitelist.batchToggleWhitelist([traderMaker, traderTaker], true, { from: operator });
                            });
                            describe("when maker has sell token balance", () => {
                              beforeEach(async () => {
                                await this.sellToken.mint(traderMaker, this.one_ether, { from: operator });
                              });
                              describe("when trader approves on behalf has approved exchange", () => {
                                beforeEach(async () => {
                                  await this.sellToken.approveOnBehalf(traderMaker, this.exchange.address, this.one_ether, { from: trader });
                                });
                                describe("trader does make order on behalf of client", () => {
                                  beforeEach(async () => {
                                    this.tx = await this.exchange.makeOrder(
                                      THREE_IDENTIFIER[0],
                                      ZERO_ADDRESS,
                                      traderMaker,
                                      false,
                                      this.sellToken.address,
                                      this.one_ether,
                                      this.buyToken.address,
                                      this.one_ether,
                                      this.timeOutBlockNumber,
                                      { from: trader }
                                    );
                                  });
                                  it("should have emitted MadeOrder and MadeOrderParticipants events", async () => {
                                    expectEvent(this.tx, "MadeOrder");
                                    expectEvent(this.tx, "MadeOrderParticipants");
                                  });
                                  it("block has occurred", async () => {
                                    assert.equal(await this.sellToken.blockedBalanceOf(traderMaker), this.one_ether);
                                  });
                                  // it('order lookup', async () => {
                                  //     console.log(await this.exchange.order(THREE_IDENTIFIER[0]))
                                  // });
                                  it("order length updated", async () => {
                                    assert.equal(await this.exchange.getOrderCount(), 1);
                                  });
                                  it("inexchange updated", async () => {
                                    assert.equal(await this.exchange.getIdentifier(0), THREE_IDENTIFIER[0]);
                                  });
                                  describe("take order - from trader", () => {
                                    describe("when taker has buy token balance", () => {
                                      beforeEach(async () => {
                                        await this.buyToken.mint(traderTaker, this.one_ether, { from: operator });
                                      });
                                      describe("when trader approves on behalf has approved exchange", () => {
                                        beforeEach(async () => {
                                          await this.buyToken.approveOnBehalf(traderTaker, this.exchange.address, this.one_ether, { from: trader });
                                        });
                                        describe("trader does take order on behalf of client", () => {
                                          beforeEach(async () => {
                                            await this.exchange.takeOrder(THREE_IDENTIFIER[0], traderTaker, this.one_ether, this.timeOutBlockNumber, {
                                              from: trader,
                                            });
                                          });
                                          describe("buy token", () => {
                                            it("taker balance updated", async () => {
                                              assert.equal(await this.buyToken.balanceOf(traderTaker), 0);
                                            });
                                            it("maker balance updated", async () => {
                                              assert.equal(await this.buyToken.balanceOf(traderMaker), this.one_ether);
                                            });
                                          });
                                          describe("sell token", () => {
                                            it("taker balance updated", async () => {
                                              assert.equal(await this.sellToken.balanceOf(traderTaker), this.one_ether);
                                            });
                                            it("maker balance updated", async () => {
                                              assert.equal(await this.sellToken.balanceOf(traderMaker), 0);
                                            });
                                          });
                                          it("blocked balance updated", async () => {
                                            assert.equal(await this.sellToken.blockedBalanceOf(traderMaker), 0);
                                          });
                                        });
                                      });
                                    });
                                  });
                                  describe("cancel order - from trader", () => {
                                    beforeEach(async () => {
                                      this.tx = await this.exchange.cancelOrder(THREE_IDENTIFIER[0], { from: trader });
                                    });
                                    it("should have emitted CancelledOrder event", async () => {
                                      expectEvent(this.tx, "CancelledOrder");
                                    });
                                    it("order removed", async () => {
                                      assert.equal(await this.exchange.getOrderCount(), 0);
                                    });
                                    // it('order removed', async () => {
                                    //     console.log(await this.exchange.order(THREE_IDENTIFIER[0]))
                                    // });
                                    it("blocked balance updated", async () => {
                                      assert.equal(await this.sellToken.blockedBalanceOf(traderMaker), 0);
                                    });
                                    it("unblocked balance updated", async () => {
                                      assert.equal(await this.sellToken.balanceOf(traderMaker), this.one_ether);
                                    });
                                  });
                                });
                                describe("batch orders", () => {
                                  describe("make sufficient orders", () => {
                                    describe("when balances", () => {
                                      beforeEach(async () => {
                                        await this.buyToken.mint(taker, this.one_ether, { from: operator });
                                        await this.buyToken.mint(traderTaker, this.one_ether, { from: operator });
                                      });
                                      describe("when approved", async () => {
                                        beforeEach(async () => {
                                          await this.buyToken.approve(this.exchange.address, this.one_ether, { from: taker });
                                          await this.buyToken.approve(this.exchange.address, this.one_ether, { from: traderTaker });
                                        });
                                        describe("make orders", () => {
                                          beforeEach(async () => {
                                            await this.exchange.makeOrder(
                                              THREE_IDENTIFIER[0],
                                              ZERO_ADDRESS,
                                              ZERO_ADDRESS,
                                              false,
                                              this.sellToken.address,
                                              this.one_ether,
                                              this.buyToken.address,
                                              this.one_ether,
                                              this.timeOutBlockNumber,
                                              { from: maker }
                                            );
                                            await this.exchange.makeOrder(
                                              THREE_IDENTIFIER[1],
                                              ZERO_ADDRESS,
                                              ZERO_ADDRESS,
                                              false,
                                              this.sellToken.address,
                                              this.one_ether,
                                              this.buyToken.address,
                                              this.one_ether,
                                              this.timeOutBlockNumber,
                                              { from: traderMaker }
                                            );
                                          });
                                          it("count updated", async () => {
                                            assert.equal(await this.exchange.getOrderCount(), 2);
                                          });
                                          describe("cancel orders from trader", async () => {
                                            it("revert when batch less than specified", async () => {
                                              await expectRevert(
                                                this.exchange.cancelOrders([THREE_IDENTIFIER[0]], { from: trader }),
                                                "Exchange: Fewer than two orders"
                                              );
                                            });
                                            it("revert when batch greater than specified", async () => {
                                              await expectRevert(
                                                this.exchange.cancelOrders(THREE_HUNDRED_ADDRESS, { from: trader }),
                                                "Exchange: Too many orders"
                                              );
                                            });
                                            describe("cancel orders", () => {
                                              beforeEach(async () => {
                                                await this.exchange.cancelOrders([THREE_IDENTIFIER[0], THREE_IDENTIFIER[1]], { from: trader });
                                              });
                                              it("orders removed", async () => {
                                                assert.equal(await this.exchange.getOrderCount(), 0);
                                              });
                                            });
                                          });
                                          describe("take orders from trader", () => {
                                            it("revert when order and buyer length not equal", async () => {
                                              await expectRevert(
                                                this.exchange.takeOrders(
                                                  [THREE_IDENTIFIER[0]],
                                                  [taker, traderTaker],
                                                  [this.one_ether, this.one_ether],
                                                  this.timeOutBlockNumber,
                                                  { from: trader }
                                                ),
                                                "Exchange: Fewer than two orders"
                                              );
                                            });
                                            it("revert when array lengths not equal", async () => {
                                              await expectRevert(
                                                this.exchange.takeOrders(
                                                  [THREE_IDENTIFIER[0], THREE_IDENTIFIER[1], THREE_IDENTIFIER[2]],
                                                  [taker, traderTaker],
                                                  [this.one_ether],
                                                  this.timeOutBlockNumber,
                                                  { from: trader }
                                                ),
                                                "Exchange: orders and buyers not equal"
                                              );
                                            });
                                            describe("take orders", () => {
                                              beforeEach(async () => {
                                                await this.exchange.takeOrders(
                                                  [THREE_IDENTIFIER[0], THREE_IDENTIFIER[1]],
                                                  [taker, traderTaker],
                                                  [this.one_ether, this.one_ether],
                                                  this.timeOutBlockNumber,
                                                  { from: trader }
                                                );
                                              });
                                              describe("buy token", () => {
                                                describe("second order", () => {
                                                  it("taker balance updated", async () => {
                                                    assert.equal(await this.buyToken.balanceOf(taker), 0);
                                                  });
                                                  it("maker balance updated", async () => {
                                                    assert.equal(await this.buyToken.balanceOf(maker), this.one_ether);
                                                  });
                                                });
                                                describe("second order", () => {
                                                  it("taker balance updated", async () => {
                                                    assert.equal(await this.buyToken.balanceOf(traderTaker), 0);
                                                  });
                                                  it("maker balance updated", async () => {
                                                    assert.equal(await this.buyToken.balanceOf(traderMaker), this.one_ether);
                                                  });
                                                });
                                              });
                                              describe("sell token", () => {
                                                describe("first order", () => {
                                                  it("taker balance updated", async () => {
                                                    assert.equal(await this.sellToken.balanceOf(taker), this.one_ether);
                                                  });
                                                  it("maker balance updated", async () => {
                                                    assert.equal(await this.sellToken.balanceOf(maker), 0);
                                                  });
                                                });
                                                describe("second order", () => {
                                                  it("taker balance updated", async () => {
                                                    assert.equal(await this.sellToken.balanceOf(traderTaker), this.one_ether);
                                                  });
                                                  it("maker balance updated", async () => {
                                                    assert.equal(await this.sellToken.balanceOf(traderMaker), 0);
                                                  });
                                                });
                                              });
                                              describe("blocked balances", () => {
                                                it("first order", async () => {
                                                  assert.equal(await this.sellToken.blockedBalanceOf(maker), 0);
                                                });
                                                it("second order", async () => {
                                                  assert.equal(await this.sellToken.blockedBalanceOf(traderMaker), 0);
                                                });
                                              });
                                            });
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
