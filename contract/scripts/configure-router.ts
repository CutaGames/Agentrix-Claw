import { ethers } from "hardhat";

async function main() {
  const routerAddress = "0xA328Df69f14f9fd1822a3de52cc19ccaA6DdA78F";
  const x402Address = "0x59d2D7d3ee5111b1FC8F4cb63CE1e14082512c23";

  const [deployer] = await ethers.getSigners();
  console.log("Configuring PaymentRouter with account:", deployer.address);

  const router = await ethers.getContractAt("PaymentRouter", routerAddress);

  // X402 channel (method=2, channelAddress, isActive, priority, minAmount, maxAmount)
  console.log("Setting X402 channel...");
  const tx = await router.setPaymentChannel(
    2, // X402
    x402Address,
    true,
    1,    // priority
    0,    // minAmount
    ethers.MaxUint256  // maxAmount
  );
  await tx.wait();
  console.log("✅ X402 channel configured on PaymentRouter");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Configuration failed:", error);
    process.exit(1);
  });
