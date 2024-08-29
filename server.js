'use strict';
const crypto = require('crypto');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const DHT = require('hyperdht');
const HyperswarmRPC = require('@hyperswarm/rpc');
const sodium = require('sodium-native');

const CONFIG = {
    BOOTSTRAP_PORT: 30001,
    SEED_LENGTH: sodium.crypto_sign_SEEDBYTES, // Using sodium's seed length constant
    DATABASE_PATH: './db/rpc-server' // Configurable path for Hypercore data
};

class P2PAuctionServer {
    constructor(id, port, parameters, databasePath) {
        this.id = id || null;
        this.port = port || 40001;
        this.parameters = parameters || null;
        this.databasePath = databasePath || './db/default';
        this.hcore = null;
        this.hbee = null;
        this.dht = null;
        this.rpc = null;
        this.rpcServer = null;
        this.rpcClient = null;
    }

    async initializeHyperbee() {
        this.hcore = new Hypercore(this.databasePath, { valueEncoding: 'json' });
        this.hbee = new Hyperbee(this.hcore, { keyEncoding: 'utf-8', valueEncoding: 'json' });
        await this.hbee.ready();
    }

    async initializeDHT() {
        let dhtSeed = (await this.hbee.get('dht-seed'))?.value;
        if (!dhtSeed) {
            dhtSeed = crypto.randomBytes(CONFIG.SEED_LENGTH);
            await this.hbee.put('dht-seed', dhtSeed);
        } else {
            dhtSeed = Buffer.from(dhtSeed).slice(0, CONFIG.SEED_LENGTH);
        }
        console.log('DHT Seed:', dhtSeed.toString('hex'));

        this.dht = new DHT({
            port: this.port,
            keyPair: DHT.keyPair(dhtSeed),
            bootstrap: [{ host: '127.0.0.1', port: CONFIG.BOOTSTRAP_PORT }]
        });
    }

    async initializeRPC() {
        let rpcSeed = (await this.hbee.get('rpc-seed'))?.value;
        if (!rpcSeed) {
            rpcSeed = crypto.randomBytes(CONFIG.SEED_LENGTH);
            await this.hbee.put('rpc-seed', rpcSeed);
        } else {
            rpcSeed = Buffer.from(rpcSeed);
            if (rpcSeed.length !== CONFIG.SEED_LENGTH) {
                throw new Error(`RPC seed must be ${CONFIG.SEED_LENGTH} bytes long.`);
            }
        }
        console.log('RPC Seed:', rpcSeed.toString('hex'));

        this.rpc = new HyperswarmRPC({ seed: Uint8Array.from(rpcSeed), dht: this.dht });
        this.rpcServer = this.rpc.createServer();
        this.rpcClient = this.rpc.createClient();
        await this.rpcServer.listen();
        console.log('RPC server started listening on public key:', this.rpcServer.publicKey.toString('hex'));
    }

    connectFunctions() {
        this.rpcServer.respond('openAuction', async (reqRaw) => {
            try {
                const { id, description, startingPrice } = JSON.parse(reqRaw.toString('utf-8'));
                await this.hbee.put(`auction-${id}`, { description, startingPrice, bids: [], createdAt: Date.now() });
                return Buffer.from(JSON.stringify({ success: true }), 'utf-8');
            } catch (error) {
                console.error('Error handling openAuction:', error);
                return Buffer.from(JSON.stringify({ success: false, error: error.message }), 'utf-8');
            }
        });

        this.rpcServer.respond('placeBid', async (reqRaw) => {
            try {
                const { id, bidder, amount } = JSON.parse(reqRaw.toString('utf-8'));
                const auction = await this.hbee.get(`auction-${id}`);
                if (!auction) {
                    return Buffer.from(JSON.stringify({ success: false, error: 'Auction not found' }), 'utf-8');
                }
                auction.bids.push({ bidder, amount, timestamp: Date.now() });
                await this.hbee.put(`auction-${id}`, auction);
                return Buffer.from(JSON.stringify({ success: true }), 'utf-8');
            } catch (error) {
                console.error('Error handling placeBid:', error);
                return Buffer.from(JSON.stringify({ success: false, error: error.message }), 'utf-8');
            }
        });

        this.rpcServer.respond('closeAuction', async (reqRaw) => {
            try {
                const { id } = JSON.parse(reqRaw.toString('utf-8'));
                const auction = await this.hbee.get(`auction-${id}`);
                if (!auction) {
                    return Buffer.from(JSON.stringify({ success: false, error: 'Auction not found' }), 'utf-8');
                }
                const highestBid = auction.bids.reduce((prev, curr) => curr.amount > prev.amount ? curr : prev, { amount: 0 });
                await this.hbee.del(`auction-${id}`);
                return Buffer.from(JSON.stringify({ success: true, winner: highestBid.bidder, amount: highestBid.amount }), 'utf-8');
            } catch (error) {
                console.error('Error handling closeAuction:', error);
                return Buffer.from(JSON.stringify({ success: false, error: error.message }), 'utf-8');
            }
        });
    }

    async openAuction(auction) {
        const { id, item, startingBid } = auction;
        const response = await this.rpcServer.request(this.rpcServer.publicKey, 'openAuction', Buffer.from(JSON.stringify({ id, description: item, startingPrice: startingBid }), 'utf-8'));
        console.log('Opened auction:', response.toString('utf-8'));
    }

    async placeBid(auctionId, bidder, amount) {
        const response = await this.rpcServer.request(this.rpcServer.publicKey, 'placeBid', Buffer.from(JSON.stringify({ id: auctionId, bidder, amount }), 'utf-8'));
        console.log('Placed bid:', response.toString('utf-8'));
    }

    async closeAuction(auctionId) {
        const response = await this.rpcServer.request(this.rpcServer.publicKey, 'closeAuction', Buffer.from(JSON.stringify({ id: auctionId }), 'utf-8'));
        console.log('Closed auction:', response.toString('utf-8'));
    }

    async start() {
        try {
            await this.initializeHyperbee();
            await this.initializeDHT();
            await this.initializeRPC();
            this.connectFunctions();
        } catch (error) {
            console.error('Error in main execution:', error);
        }
    }

}

module.exports = P2PAuctionServer;

/*
// Create and start the P2P auction server
const auctionServer = new P2PAuctionServer();
auctionServer.start();
*/