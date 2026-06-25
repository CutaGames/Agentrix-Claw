import { keccak256, toUtf8Bytes } from 'ethers';

const paymentId = '2f3d51d6-c174-4e73-a498-a15f2d1d3bff';
const orderId = '4f787bdf-0e82-4cac-bf02-c6d294e5092a';

console.log('paymentId:', paymentId);
console.log('keccak256(paymentId):', keccak256(toUtf8Bytes(paymentId)));
console.log();
console.log('orderId:', orderId);
console.log('keccak256(orderId):', keccak256(toUtf8Bytes(orderId)));
console.log();
console.log('Expected paymentIdBytes32 from logs: 0x2b99df5b2e740d28217e94ae5c0ab61cdc230c83ae045cf8d939da097ec28587');
