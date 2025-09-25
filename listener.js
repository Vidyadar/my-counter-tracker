require('dotenv').config();
const { ethers } = require('ethers');
const ABI = require("./abi.json");  // full ABI from Basescan

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, provider);

async function sendToTalent(payload) {
  const res = await fetch(process.env.TALENT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.TALENT_API_KEY
    },
    body: JSON.stringify(payload),
  });

  const json = await res.text().then(t => {
    try { return JSON.parse(t); } catch { return t; }
  });

  return { ok: res.ok, status: res.status, body: json };
}

contract.on("CountIncremented", async (newCount, user, task, workId, event) => {
  try {
    console.log("🔔 Event:", { newCount: newCount.toString(), user, task, workId: workId.toString() });

    const block = await provider.getBlock(event.blockNumber);
    const timestamp = new Date(block.timestamp * 1000).toISOString();

    const payload = {
      type: "verified_contract_usage",   // use Talent’s actual metric name
      account: { type: "OnchainAccount", source: "wallet", identifier: user },
      data: {
        contract_address: process.env.CONTRACT_ADDRESS,
        task,
        newCount: newCount.toString(),
        workId: workId.toString()
      },
      date: timestamp
    };

    console.log("➡️ Sending to Talent:", payload);
    const result = await sendToTalent(payload);
    console.log("✅ Talent API:", result);

    if (result.ok) {
      const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      const signedContract = contract.connect(signer);
      const tx = await signedContract.acknowledgeProgress(workId);
      console.log("📌 Ack tx:", tx.hash);
      await tx.wait();
      console.log("✅ WorkId acknowledged:", workId.toString());
    } else {
      console.warn("⚠️ Talent API error, not acknowledging on-chain.");
    }

  } catch (err) {
    console.error("❌ Listener error:", err);
  }
});

console.log("👂 Listening on Base Mainnet for CountIncremented...");
