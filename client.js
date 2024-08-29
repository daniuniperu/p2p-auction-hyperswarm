const P2PAuctionServer = require('./server.js');


async function executeAuctionClient() {
    const customer1 = new P2PAuctionServer('Customer1', 40001, [{ host: '127.0.0.1', port: 30001 }], './db/customer1');
    const customer2 = new P2PAuctionServer('Customer2', 40001, [{ host: '127.0.0.1', port: 30001 }], './db/customer2');
    const customer3 = new P2PAuctionServer('Customer3', 40001, [{ host: '127.0.0.1', port: 30001 }], './db/customer3');

    // Start the customer session peer, 
    await Promise.all([customer1.start(), customer2.start(), customer3.start()]);

    // Customer 1 opens an auction
    const customerAuction1 = `${customer1.id}-${Date.now()}`;
    const auctionNumber1 = { id: customerAuction1, item: 'Pic#1', startingBid: 75 };
    await customer1.openAuction(auctionNumber1);

    // Customer 2 opens an auction
    const customerAuction2 = `${customer2.id}-${Date.now()}`;
    const auction2 = { id: customerAuction2, item: 'Pic#2', startingBid: 60 };
    await customer2.openAuction(auction2);

    // Customer 2 makes a bid for Customer 1's auction
    await customer2.placeBid(auctionNumber1.id, 75);

    // Customer 3 makes a bid for Customer 1's auction
    await customer3.placeBid(auctionNumber1.id, 75.5);

    // Customer 2 makes another bid for Customer 1's auction
    await customer2.placeBid(auctionNumber1.id, 80);

    // Customer 1 closes the auction
    await customer1.closeAuction(auctionNumber1.id, customer1.id);
}

executeAuctionClient().catch(console.error);
