const { ethers } = require('ethers');
const selector = ethers.id("quickPaySplit(address,address,uint256,bytes32)").substring(0, 10);
console.log("Selector:", selector);
console.log("transferFrom:", ethers.id("transferFrom(address,address,uint256)").substring(0, 10));
