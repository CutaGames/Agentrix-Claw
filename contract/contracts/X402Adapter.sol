// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./access/AgentrixRoles.sol";
import "./PaymentRouter.sol";

/**
 * @title X402Adapter
 * @dev X402协议适配器合约，用于处理X402协议支付
 * @notice 支持签名验证和批量支付处理
 *
 * 审计修复（L8 D5）：
 *  - C-02 付款人用 EIP-712 签名。签进 sessionId、paymentId、payer、recipient、amount、expiry、nonce，
 *    域里带 chainId 和本合约地址，所以换链、换合约、改任何一个字段、过期、重放都验不过。
 *  - H-05 通道完成支付时，把钱一起交给 PaymentRouter，并核对 router 里登记的收款人和金额与会话一致。
 *  - H-04 relayer 改成 AccessControl 角色，变更有事件。
 *
 * 说明：这个合约是「预充值」模型。付款人先 `deposit()` 存入 ETH，合约按付款人记账（`deposits[payer]`）；
 * 付款人对会话的签名授权的是**他自己存款**里的钱按会话付出去，付款人自己不在这笔交易里出钱，所以只有 relayer 能触发执行。
 *  - 评审 M1：执行时从 `deposits[payer]` 扣减，不够就拒。没有存款的付款人，即使签了名、即使合约里有别人存的钱，也付不出去。
 *  - 付款人可以随时 `withdrawDeposit()` 取回还没用掉的存款。
 *  - 直接往合约转账（receive）只是增加合约余额，不记到任何人名下，不能用来付款；owner 可以 emergencyWithdraw 取走这部分。
 */
contract X402Adapter is AgentrixRoles, ReentrancyGuard, Pausable, EIP712 {
    // X402支付会话
    struct X402Session {
        bytes32 sessionId;
        bytes32 paymentId;
        address payer;
        address recipient;
        uint256 amount;
        bytes compressedData;
        bool executed;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 nonce; // 付款人名下唯一，签名里带着它
    }

    bytes32 public constant X402_PAYMENT_TYPEHASH = keccak256(
        "X402Payment(bytes32 sessionId,bytes32 paymentId,address payer,address recipient,uint256 amount,uint256 expiry,uint256 nonce)"
    );

    // 事件
    event X402SessionCreated(
        bytes32 indexed sessionId,
        bytes32 indexed paymentId,
        address indexed payer,
        uint256 amount
    );

    event X402PaymentExecuted(
        bytes32 indexed sessionId,
        bytes32 indexed paymentId,
        address indexed recipient,
        uint256 amount,
        uint256 gasSaved
    );

    event RelayerChanged(address indexed previousRelayer, address indexed newRelayer);
    event NonceCancelled(address indexed payer, uint256 indexed nonce);
    event Deposited(address indexed payer, uint256 amount);
    event DepositWithdrawn(address indexed payer, uint256 amount);

    // 状态变量
    mapping(bytes32 => X402Session) public sessions;
    PaymentRouter public paymentRouter;
    address public relayer; // 当前登记的 X402 中继器地址（同时持有 RELAYER_ROLE）

    mapping(address => uint256) public deposits; // 付款人存入、还没用掉的 ETH（按付款人记账）
    mapping(address => uint256) public nextNonce; // 付款人下一个会话序号
    mapping(address => mapping(uint256 => bool)) public usedNonces; // 已执行或已作废

    constructor(address payable _paymentRouter) EIP712("AgentrixX402Adapter", "1") {
        require(_paymentRouter != address(0), "Invalid router");
        paymentRouter = PaymentRouter(_paymentRouter);
    }

    /**
     * @dev 付款人存入 ETH，记在自己名下。之后只有他签名的会话才能动用这笔钱。
     */
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Amount must be greater than 0");
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @dev 付款人取回自己还没用掉的存款
     */
    function withdrawDeposit(uint256 amount) external nonReentrant {
        require(deposits[msg.sender] >= amount, "Insufficient deposit");
        deposits[msg.sender] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        emit DepositWithdrawn(msg.sender, amount);
    }

    /**
     * @dev 创建X402支付会话
     * @param paymentId 支付ID
     * @param recipient 收款地址
     * @param amount 支付金额
     * @param compressedData 压缩的交易数据
     * @param expiresAt 过期时间
     */
    function createSession(
        bytes32 paymentId,
        address recipient,
        uint256 amount,
        bytes calldata compressedData,
        uint256 expiresAt
    ) external returns (bytes32) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(expiresAt > block.timestamp, "Invalid expiry");

        bytes32 sessionId = keccak256(
            abi.encodePacked(
                paymentId,
                msg.sender,
                recipient,
                amount,
                block.timestamp
            )
        );
        // 同一区块里重复创建会覆盖已有会话（包括把已执行的会话改回未执行），直接拒绝
        require(sessions[sessionId].sessionId == bytes32(0), "Session already exists");

        uint256 nonce = nextNonce[msg.sender]++;

        sessions[sessionId] = X402Session({
            sessionId: sessionId,
            paymentId: paymentId,
            payer: msg.sender,
            recipient: recipient,
            amount: amount,
            compressedData: compressedData,
            executed: false,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            nonce: nonce
        });

        emit X402SessionCreated(sessionId, paymentId, msg.sender, amount);
        return sessionId;
    }

    /**
     * @dev 某个会话应当被付款人签名的 EIP-712 摘要（给链下签名方和测试用）
     */
    function paymentDigest(bytes32 sessionId) public view returns (bytes32) {
        X402Session storage session = sessions[sessionId];
        require(session.sessionId != bytes32(0), "Session not found");
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    X402_PAYMENT_TYPEHASH,
                    session.sessionId,
                    session.paymentId,
                    session.payer,
                    session.recipient,
                    session.amount,
                    session.expiresAt,
                    session.nonce
                )
            )
        );
    }

    /**
     * @dev 执行X402支付（由中继器调用）
     * @param sessionId 会话ID
     * @param signature payer 的 EIP-712 签名
     */
    function executePayment(
        bytes32 sessionId,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(hasRole(RELAYER_ROLE, msg.sender), "Only relayer can execute");

        X402Session storage session = sessions[sessionId];
        require(session.sessionId != bytes32(0), "Session not found");
        require(!session.executed, "Payment already executed");
        require(block.timestamp <= session.expiresAt, "Session expired");
        require(!usedNonces[session.payer][session.nonce], "Nonce already used");

        // 验证签名：必须由 payer 对本会话的全部关键字段签名（OZ ECDSA 拒绝可延展的 s 值）
        address signer = ECDSA.recover(paymentDigest(sessionId), signature);
        require(signer == session.payer, "Invalid signature");

        // router 里登记的这笔支付必须和会话一致，否则会话付一份、router 记另一份
        PaymentRouter.PaymentRecord memory record = paymentRouter.getPayment(session.paymentId);
        require(
            record.recipient == session.recipient &&
                record.amount == session.amount &&
                record.method == PaymentRouter.PaymentMethod.X402,
            "Router record mismatch"
        );
        // 只能动用付款人自己的存款
        require(deposits[session.payer] >= session.amount, "Insufficient deposit");

        // 先落状态再对外交互
        session.executed = true;
        usedNonces[session.payer][session.nonce] = true;
        deposits[session.payer] -= session.amount;

        // 把钱和完成通知一起交给 PaymentRouter：收款人在 router 里 withdraw
        paymentRouter.completePayment{value: session.amount}(session.paymentId);

        // 计算节省的Gas（示例）
        uint256 gasSaved = 100000; // 实际应该根据压缩率计算

        emit X402PaymentExecuted(
            sessionId,
            session.paymentId,
            session.recipient,
            session.amount,
            gasSaved
        );
    }

    /**
     * @dev 付款人作废自己一个还没执行的会话（签名已经发出去又反悔时用）
     */
    function cancelNonce(uint256 nonce) external {
        require(nonce < nextNonce[msg.sender], "Unknown nonce");
        require(!usedNonces[msg.sender][nonce], "Nonce already used");
        usedNonces[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    function _relayerRoleOnlyViaSetter() internal pure override returns (bool) {
        return true;
    }

    /**
     * @dev 设置中继器地址：旧的收回角色，新的授予角色
     */
    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer");
        address previous = relayer;
        if (previous != address(0)) {
            _revokeRole(RELAYER_ROLE, previous);
        }
        relayer = _relayer;
        _grantRole(RELAYER_ROLE, _relayer);
        emit RelayerChanged(previous, _relayer);
    }
    
    /**
     * @dev 暂停合约
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev 恢复合约
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev 紧急提款
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev 查询会话信息
     */
    function getSession(bytes32 sessionId)
        external
        view
        returns (X402Session memory)
    {
        return sessions[sessionId];
    }
    
    /**
     * @dev 接收 ETH
     */
    receive() external payable {}
}
