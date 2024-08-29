'use strict';

const crypto = require('crypto');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const DHT = require('hyperdht');
const RPC = require('@hyperswarm/rpc');
const sodium = require('sodium-native');
const HyperswarmRPC = require('@hyperswarm/rpc');

const CONFIG = {
  DHT_PORT: 40001,
  BOOTSTRAP_PORT: 30001
};

const main = async () => {
  try {
    // Initialize Hypercore and Hyperbee
    const hcore = new Hypercore('./db/rpc-server', { valueEncoding: 'json' });
    const hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'json' });
    await hbee.ready();

    // Set up and Initialize DHT
    let dhtSeed = (await hbee.get('dht-seed'))?.value;
    if (!dhtSeed) {
      dhtSeed = crypto.randomBytes(sodium.crypto_sign_SEEDBYTES);
      await hbee.put('dht-seed', dhtSeed);
    } else {
      dhtSeed = Buffer.from(dhtSeed).slice(0, sodium.crypto_sign_SEEDBYTES);
    }
    console.log('dhtSeed: '+dhtSeed);

    const dht = new DHT({
      port: CONFIG.DHT_PORT,
      keyPair: DHT.keyPair(dhtSeed), 
      bootstrap: [{ host: '127.0.0.1', port: CONFIG.BOOTSTRAP_PORT }]
    });

    // Set up RPC server
    let rpcSeed = (await hbee.get('rpc-seed'))?.value;
    if (!rpcSeed) {
      rpcSeed = crypto.randomBytes(sodium.crypto_sign_SEEDBYTES);
      await hbee.put('rpc-seed', rpcSeed);
    } else {
        rpcSeed = Buffer.from(rpcSeed);
        if (rpcSeed.length !== sodium.crypto_sign_SEEDBYTES) {
          throw new Error(`"seed" must be crypto_sign_SEEDBYTES bytes long`);
        }
      }

    // Create RPC instance
    const rpc = new HyperswarmRPC({ seed:  Uint8Array.from(rpcSeed), dht });    
    const rpcServer = rpc.createServer();
    await rpcServer.listen();
    console.log('RPC server started listening on public key:', rpcServer.publicKey.toString('hex'));

    // Bind handlers to RPC server
    rpcServer.respond('openAuction', async (reqRaw) => {
      try {
        const { id, description, startingPrice } = JSON.parse(reqRaw.toString('utf-8'));
        await hbee.put(`auction-${id}`, { description, startingPrice, bids: [], createdAt: Date.now() });
        return Buffer.from(JSON.stringify({ success: true }), 'utf-8');
      } catch (error) {
        console.error('Error handling openAuction:', error);
        return Buffer.from(JSON.stringify({ success: false, error: error.message }), 'utf-8');
      }
    });

    rpcServer.respond('placeBid', async (reqRaw) => {
      try {
        const { id, bidder, amount } = JSON.parse(reqRaw.toString('utf-8'));
        const auction = await hbee.get(`auction-${id}`);
        if (!auction) {
          return Buffer.from(JSON.stringify({ success: false, error: 'Auction not found' }), 'utf-8');
        }
        auction.bids.push({ bidder, amount, timestamp: Date.now() });
        await hbee.put(`auction-${id}`, auction);
        return Buffer.from(JSON.stringify({ success: true }), 'utf-8');
      } catch (error) {
        console.error('Error handling placeBid:', error);
        return Buffer.from(JSON.stringify({ success: false, error: error.message }), 'utf-8');
      }
    });

    rpcServer.respond('closeAuction', async (reqRaw) => {
      try {
        const { id } = JSON.parse(reqRaw.toString('utf-8'));
        const auction = await hbee.get(`auction-${id}`);
        if (!auction) {
          return Buffer.from(JSON.stringify({ success: false, error: 'Auction not found' }), 'utf-8');
        }
        const highestBid = auction.bids.reduce((prev, curr) => curr.amount > prev.amount ? curr : prev, { amount: 0 });
        await hbee.del(`auction-${id}`);
        return Buffer.from(JSON.stringify({ success: true, winner: highestBid.bidder, amount: highestBid.amount }), 'utf-8');
      } catch (error) {
        console.error('Error handling closeAuction:', error);
        return Buffer.from(JSON.stringify({ success: false, error: error.message }), 'utf-8');
      }
    });

  } catch (error) {
    console.error('Error in main execution:', error);
  }
};

main();
