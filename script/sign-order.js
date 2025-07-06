const { ethers } = require("ethers");

async function main() {
    const LOP_ADDRESS = "0x111111125421cA6dc452d289314280a0f8842A65";
    const chainId = 42161;  // Arbitrum One mainnet

    const domain = {
        name: "1inch Aggregation Router",
        version: "6",
        chainId: 42161,
        verifyingContract: "0x111111125421cA6dc452d289314280a0f8842A65",
    };

    const types = {
        Order: [
            { name: "salt", type: "uint256" },
            { name: "maker", type: "address" },
            { name: "receiver", type: "address" },
            { name: "makerAsset", type: "address" },
            { name: "takerAsset", type: "address" },
            { name: "makingAmount", type: "uint256" },
            { name: "takingAmount", type: "uint256" },
            { name: "makerTraits", type: "uint256" }
        ]
    };

    const order = {
        salt: "123456",
        maker: "0x1ed17B61CdFa0572e98FF006625258c63255544A",
        receiver: "0x4dDd8F7371Bb05CCa7eEdfF260931586F0c6A0F3",
        makerAsset: "0xCE252C063B7C66417934C85c177AE61Bf0e9858a",
        takerAsset: "0x61ed92A2Aa23B2E7da92adEA1209eC71f8098e42",
        makingAmount: "1000000000000000",
        takingAmount: "500000000000000000000",
        makerTraits: "0"
    };

    const privateKey = process.env.MAKER_PRIVATE_KEY;
    if (!privateKey) throw new Error("MAKER_PRIVATE_KEY env var required");
    const wallet = new ethers.Wallet(privateKey);

    // Compute and log the order hash
    const orderHash = ethers.TypedDataEncoder.hash(domain, types, order);
    console.log("orderHash:", orderHash);

    // Sign
    const signature = await wallet.signTypedData(domain, types, order);
    const sig = ethers.Signature.from(signature);
    console.log("v:", sig.v);
    console.log("r:", sig.r);
    console.log("s:", sig.s);
    // Pack vs
    const vsBigInt = BigInt(sig.s) | (BigInt(sig.v - 27) << 255n);
    const vsHex = "0x" + vsBigInt.toString(16).padStart(64, '0');

    console.log("r:", sig.r);
    console.log("vs:", vsHex);
    const recovered = ethers.verifyTypedData(domain, types, order, signature);
    console.log("Recovered:", recovered);
    
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});