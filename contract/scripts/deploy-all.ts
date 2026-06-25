import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  // Read config from env
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address;
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS || "0xc23453b4842FDc4360A0a3518E2C0f51a2069386";
  const treasuryAddress = process.env.PLATFORM_TREASURY_ADDRESS || adminAddress;
  const rebatePoolAddress = process.env.SYSTEM_REBATE_POOL_ADDRESS || adminAddress;

  console.log("\n--- Deployment Config ---");
  console.log("Admin/Relayer:", adminAddress);
  console.log("USDC Token:", usdcAddress);
  console.log("Treasury:", treasuryAddress);
  console.log("Rebate Pool:", rebatePoolAddress);
  console.log("-------------------------\n");

  const deployed: Record<string, string> = {};

  // 1. Deploy Commission (V1)
  console.log("1/8 Deploying Commission...");
  const Commission = await ethers.getContractFactory("Commission");
  const commission = await Commission.deploy();
  await commission.waitForDeployment();
  deployed.COMMISSION_CONTRACT_ADDRESS = await commission.getAddress();
  console.log("  Commission:", deployed.COMMISSION_CONTRACT_ADDRESS);

  // Configure Commission
  const commissionContract = commission as any;
  let tx = await commissionContract.configureSettlementToken(usdcAddress, treasuryAddress, rebatePoolAddress);
  await tx.wait();
  console.log("  → Settlement token configured");

  tx = await commissionContract.setRelayer(adminAddress, true);
  await tx.wait();
  console.log("  → Relayer set:", adminAddress);

  // 2. Deploy PaymentRouter
  console.log("2/8 Deploying PaymentRouter...");
  const PaymentRouter = await ethers.getContractFactory("PaymentRouter");
  const paymentRouter = await PaymentRouter.deploy();
  await paymentRouter.waitForDeployment();
  deployed.PAYMENT_ROUTER_ADDRESS = await paymentRouter.getAddress();
  console.log("  PaymentRouter:", deployed.PAYMENT_ROUTER_ADDRESS);

  // 3. Deploy X402Adapter
  console.log("3/8 Deploying X402Adapter...");
  const X402Adapter = await ethers.getContractFactory("X402Adapter");
  const x402 = await X402Adapter.deploy(deployed.PAYMENT_ROUTER_ADDRESS);
  await x402.waitForDeployment();
  deployed.X402_ADAPTER_ADDRESS = await x402.getAddress();
  console.log("  X402Adapter:", deployed.X402_ADAPTER_ADDRESS);

  // Configure X402 relayer
  const x402Contract = x402 as any;
  tx = await x402Contract.setRelayer(adminAddress);
  await tx.wait();
  console.log("  → X402 Relayer set:", adminAddress);

  // 4. Deploy ERC8004SessionManager
  console.log("4/8 Deploying ERC8004SessionManager...");
  const ERC8004 = await ethers.getContractFactory("ERC8004SessionManager");
  const erc8004 = await ERC8004.deploy(usdcAddress);
  await erc8004.waitForDeployment();
  deployed.ERC8004_SESSION_MANAGER_ADDRESS = await erc8004.getAddress();
  console.log("  ERC8004SessionManager:", deployed.ERC8004_SESSION_MANAGER_ADDRESS);

  // Configure ERC8004 relayer
  const erc8004Contract = erc8004 as any;
  tx = await erc8004Contract.setRelayer(adminAddress);
  await tx.wait();
  console.log("  → ERC8004 Relayer set:", adminAddress);

  // 5. Deploy AutoPay
  console.log("5/8 Deploying AutoPay...");
  const AutoPay = await ethers.getContractFactory("AutoPay");
  const autoPay = await AutoPay.deploy();
  await autoPay.waitForDeployment();
  deployed.AUTO_PAY_ADDRESS = await autoPay.getAddress();
  console.log("  AutoPay:", deployed.AUTO_PAY_ADDRESS);

  // Configure AutoPay token
  const autoPayContract = autoPay as any;
  tx = await autoPayContract.setPaymentToken(usdcAddress);
  await tx.wait();
  console.log("  → Payment token set");

  // 6. Deploy CommissionV2
  console.log("6/8 Deploying CommissionV2...");
  const CommissionV2 = await ethers.getContractFactory("CommissionV2");
  const commissionV2 = await CommissionV2.deploy(usdcAddress, treasuryAddress);
  await commissionV2.waitForDeployment();
  deployed.COMMISSION_V2_ADDRESS = await commissionV2.getAddress();
  console.log("  CommissionV2:", deployed.COMMISSION_V2_ADDRESS);

  // Configure CommissionV2 relayer
  const commissionV2Contract = commissionV2 as any;
  tx = await commissionV2Contract.setRelayer(adminAddress, true);
  await tx.wait();
  console.log("  → CommissionV2 Relayer set:", adminAddress);

  // 7. Deploy BudgetPool
  console.log("7/8 Deploying BudgetPool...");
  const BudgetPool = await ethers.getContractFactory("BudgetPool");
  const budgetPool = await BudgetPool.deploy(usdcAddress, treasuryAddress, 100); // 1% platform fee
  await budgetPool.waitForDeployment();
  deployed.BUDGET_POOL_ADDRESS = await budgetPool.getAddress();
  console.log("  BudgetPool:", deployed.BUDGET_POOL_ADDRESS);

  // 8. Deploy AuditProof
  console.log("8/8 Deploying AuditProof...");
  const AuditProof = await ethers.getContractFactory("AuditProof");
  const auditProof = await AuditProof.deploy(treasuryAddress);
  await auditProof.waitForDeployment();
  deployed.AUDIT_PROOF_CONTRACT_ADDRESS = await auditProof.getAddress();
  console.log("  AuditProof:", deployed.AUDIT_PROOF_CONTRACT_ADDRESS);

  // Configure PaymentRouter channels
  console.log("\nConfiguring PaymentRouter channels...");
  const routerContract = paymentRouter as any;
  // X402 channel (method, channelAddress, isActive, priority, minAmount, maxAmount)
  tx = await routerContract.setPaymentChannel(
    2, // X402
    deployed.X402_ADAPTER_ADDRESS,
    true,
    1,    // priority
    0,    // minAmount
    ethers.MaxUint256  // maxAmount
  );
  await tx.wait();
  console.log("  → X402 channel configured");

  // Summary
  console.log("\n========================================");
  console.log("  ALL CONTRACTS DEPLOYED SUCCESSFULLY");
  console.log("========================================");
  console.log("\nDeployed addresses:");
  for (const [key, addr] of Object.entries(deployed)) {
    console.log(`  ${key}=${addr}`);
  }

  // Write .env.deployed file
  const envContent = Object.entries(deployed)
    .map(([key, addr]) => `${key}=${addr}`)
    .join("\n");
  
  const envPath = path.join(__dirname, "..", ".env.deployed");
  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`\nAddresses written to: ${envPath}`);
  console.log("Copy these to backend/.env, frontend/.env.local, and contract/.env");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
