'use strict';

const HyperswarmRPC = require('@hyperswarm/rpc');

// Configuration
const CONFIG = {
  PORT: process.env.RPC_PORT || 3000 // Use environment variable or default to 3000
};

// Function to initialize RPC client
const initializeClient = async () => {
  const rpc = new HyperswarmRPC.Client();
  await rpc.connect(CONFIG.PORT);
  return rpc;
};

// Function to open an auction
const openAuction = async (rpc, itemId, description, price) => {
  try {
    await rpc.call('openAuction', itemId, description, price);
    console.log('Auction opened for item:', itemId);
  } catch (error) {
    console.error('Failed to open auction:', error);
  }
};

// Function to place a bid
const placeBid = async (rpc, itemId, bidderId, bidAmount) => {
  try {
    await rpc.call('placeBid', itemId, bidderId, bidAmount);
    console.log('Bid placed by', bidderId, 'for item:', itemId, 'with amount:', bidAmount);
  } catch (error) {
    console.error('Failed to place bid:', error);
  }
};

// Function to close an auction
const closeAuction = async (rpc, itemId) => {
  try {
    const result = await rpc.call('closeAuction', itemId);
    console.log('Auction closed for item:', itemId, 'Result:', result);
  } catch (error) {
    console.error('Failed to close auction:', error);
  }
};

// Main function to execute auction operations
const main = async () => {
  let rpc;
  try {
    rpc = await initializeClient();

    // Open an auction
    await openAuction(rpc, 'pic1', 'Sell Pic#1', 75);

    // Place bids
    await placeBid(rpc, 'pic1', 'Client2', 80);

    // Close auction
    await closeAuction(rpc, 'pic1');

  } catch (error) {
    console.error('Error in auction operations:', error);
  } finally {
    if (rpc) {
      await rpc.close(); // Ensure RPC client is properly closed
      console.log('RPC client closed');
    }
  }
};

main().catch(console.error);
