'use strict';

const crypto = require('crypto');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const DHT = require('hyperdht');
const HyperswarmRPC = require('@hyperswarm/rpc');
const sodium = require('sodium-native');

const P2PAuctionServer = require('./server'); // Import the server class

const CONFIG = {
    BOOTSTRAP_PORT: 30001,
    SEED_LENGTH: sodium.crypto_sign_SEEDBYTES, // Using sodium's seed length constant
    DATABASE_PATH: './db/rpc-server' // Configurable path for Hypercore data
};

async function executeClientOperations() {
    // Create an instance of P2PAuctionServer
    const server = new P2PAuctionServer('Server1', 40001, [{ host: '127.0.0.1', port: 30001 }], './db/rpc-server');
    await server.start(); // Start the server and bind handlers

    // Initialize Hyperbee for client
    const hcore = new Hypercore('./db/rpc-client');
    const hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'binary' });
    await hbee.ready();

    // Resolve distributed hash table seed for key pair
    let dhtSeed = (await hbee.get('dht-seed'))?.value;
    if (!dhtSeed) {
        // Not found, generate and store in db
        dhtSeed = crypto.randomBytes(CONFIG.SEED_LENGTH);
        await hbee.put('dht-seed', dhtSeed);
    }
    console.log('DHT Seed Client:', dhtSeed.toString('hex'));
    // Start distributed hash table, it is used for RPC service discovery
    const dht = new DHT({
        port: 50001,
        keyPair: DHT.keyPair(dhtSeed),
        bootstrap: [{ host: '127.0.0.1', port: 30001 }] // Note bootstrap points to DHT that is started via CLI
    });

    // RPC library for client
    const rpc = new HyperswarmRPC({ dht });

    try {
        // Wait for server to be ready
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Add a delay to ensure the server is ready

        // Public key of RPC server, used instead of address, the address is discovered via DHT
        const serverPubKey = Buffer.from(server.rpcServer.publicKey, 'hex'); // Use server's public key
        console.log('[CLIENT] connected to public key:', serverPubKey.toString('hex'))
        // Customer 1 opens an auction
        const auctionId1 = 'customer1';
        const openAuctionPayload = { id: auctionId1, description: 'Pic#1', startingPrice: 75 };
        const openAuctionRespRaw = await rpc.request(serverPubKey, 'openAuction', Buffer.from(JSON.stringify(openAuctionPayload), 'utf-8'));
        console.log('openAuctionRespRaw:' + openAuctionRespRaw)

        // Customer 2 opens an auction
        const auctionId2 = 'customer2';
        const openAuctionPayload2 = { id: auctionId2, description: 'Pic#2', startingPrice: 60 };
        const openAuctionRespRaw2 = await rpc.request(serverPubKey, 'openAuction', Buffer.from(JSON.stringify(openAuctionPayload2), 'utf-8'));
        console.log('openAuctionRespRaw:' + openAuctionRespRaw2)

        // Customer 2 makes a bid for Customer 1's auction
        const placeBidPayload = { id: auctionId1, bidder: 'customer2', amount: 75 };
        const placeBidRespRaw = await rpc.request(serverPubKey, 'placeBid', Buffer.from(JSON.stringify(placeBidPayload), 'utf-8'));
        console.log('Place Bid Response:', JSON.parse(placeBidRespRaw.toString('utf-8')));


        // Customer 3 makes a bid for Customer 1's auction
        const placeBidPayload3 = { id: auctionId1, bidder: 'customer3', amount: 75.5 };
        const placeBidRespRaw3 = await rpc.request(serverPubKey, 'placeBid', Buffer.from(JSON.stringify(placeBidPayload3), 'utf-8'));
        console.log('Place Bid Response:', JSON.parse(placeBidRespRaw3.toString('utf-8')));

        // Customer 2 makes another bid for Customer 1's auction
        const placeBidPayload4 = { id: auctionId1, bidder: 'customer2', amount: 80 };
        const placeBidRespRaw4 = await rpc.request(serverPubKey, 'placeBid', Buffer.from(JSON.stringify(placeBidPayload4), 'utf-8'));
        console.log('Place Bid Response:', JSON.parse(placeBidRespRaw4.toString('utf-8')));


        // Close auction
        // Customer 1 closes the auction
        const closeAuctionPayload = { id: auctionId1 };
        const closeAuctionRespRaw = await rpc.request(serverPubKey, 'closeAuction', Buffer.from(JSON.stringify(closeAuctionPayload), 'utf-8'));
        console.log('Close Auction Response:', JSON.parse(closeAuctionRespRaw.toString('utf-8')));

    } catch (error) {
        console.error('Error during RPC operations:', error);
    } finally {
        // Properly clean up
        await rpc.destroy();
        await dht.destroy();

    }
}

executeClientOperations().catch(console.error);


/*
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
*/