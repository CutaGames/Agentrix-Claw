// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title PaymentRouter
 * @dev 支付路由合约，支持多种支付方式的路由选择
 */
contract PaymentRouter is Ownable, ReentrancyGuard, Pausable {
    // 支付方式枚举
    enum PaymentMethod {
        STRIPE,
        WALLET,
        X402,
        MULTISIG
    }

    // 支付通道结构
    struct PaymentChannel {
        address channelAddress;
        bool isActive;
        uint256 priority; // 优先级，数字越大优先级越高
        uint256 minAmount; // 最小金额
        uint256 maxAmount; // 最大金额
    }

    // 支付记录
    struct PaymentRecord {
        bytes32 paymentId;
        address payer;
        address recipient;
        uint256 amount;
        PaymentMethod method;
        bytes32 sessionId; // Session ID（三层ID之一）
        uint256 merchantPrice; // 商户设置的价格（根据国家、通道）
        uint256 channelFee; // 通道费用
        bool completed;
        uint256 timestamp;
    }

    // 事件
    event PaymentRouted(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        PaymentMethod method,
        bytes32 sessionId,
        uint256 merchantPrice,
        uint256 channelFee
    );

    event PaymentCompleted(
        bytes32 indexed paymentId,
        address indexed recipient,
        uint256 amount
    );

    // 状态变量
    mapping(PaymentMethod => PaymentChannel) public paymentChannels;
    mapping(bytes32 => PaymentRecord) public payments;
    mapping(address => uint256) public balances;

    /**
     * @dev 路由支付请求（新版本，支持Session ID和商户价格）
     * @param paymentId 支付ID
     * @param recipient 收款地址
     * @param amount 支付金额
     * @param method 支付方式
     * @param sessionId Session ID（三层ID之一）
     * @param merchantPrice 商户设置的价格（根据国家、通道）
     * @param channelFee 通道费用
     */
    function routePayment(
        bytes32 paymentId,
        address recipient,
        uint256 amount,
        PaymentMethod method,
        bytes32 sessionId,
        uint256 merchantPrice,
        uint256 channelFee
    ) external payable nonReentrant whenNotPaused {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(
            paymentChannels[method].isActive,
            "Payment channel not active"
        );
        require(
            amount >= paymentChannels[method].minAmount &&
                amount <= paymentChannels[method].maxAmount,
            "Amount out of range"
        );

        // 创建支付记录
        payments[paymentId] = PaymentRecord({
            paymentId: paymentId,
            payer: msg.sender,
            recipient: recipient,
            amount: amount,
            method: method,
            sessionId: sessionId,
            merchantPrice: merchantPrice,
            channelFee: channelFee,
            completed: false,
            timestamp: block.timestamp
        });

        emit PaymentRouted(
            paymentId,
            msg.sender,
            recipient,
            amount,
            method,
            sessionId,
            merchantPrice,
            channelFee
        );

        // 根据支付方式处理
        if (method == PaymentMethod.WALLET) {
            // 直接转账
            require(msg.value >= amount, "Insufficient payment");
            balances[recipient] += amount;
            payments[paymentId].completed = true;
            emit PaymentCompleted(paymentId, recipient, amount);
        }
        // X402和MULTISIG需要其他合约处理
    }

    /**
     * @dev 路由支付请求（旧版本，保持向后兼容）
     * @param paymentId 支付ID
     * @param recipient 收款地址
     * @param amount 支付金额
     * @param method 支付方式
     */
    function routePaymentLegacy(
        bytes32 paymentId,
        address recipient,
        uint256 amount,
        PaymentMethod method
    ) external payable nonReentrant whenNotPaused {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(
            paymentChannels[method].isActive,
            "Payment channel not active"
        );
        require(
            amount >= paymentChannels[method].minAmount &&
                amount <= paymentChannels[method].maxAmount,
            "Amount out of range"
        );

        // 创建支付记录
        payments[paymentId] = PaymentRecord({
            paymentId: paymentId,
            payer: msg.sender,
            recipient: recipient,
            amount: amount,
            method: method,
            sessionId: bytes32(0),
            merchantPrice: amount,
            channelFee: 0,
            completed: false,
            timestamp: block.timestamp
        });

        emit PaymentRouted(
            paymentId,
            msg.sender,
            recipient,
            amount,
            method,
            bytes32(0),
            amount,
            0
        );

        // 根据支付方式处理
        if (method == PaymentMethod.WALLET) {
            // 直接转账
            require(msg.value >= amount, "Insufficient payment");
            balances[recipient] += amount;
            payments[paymentId].completed = true;
            emit PaymentCompleted(paymentId, recipient, amount);
        }
        // X402和MULTISIG需要其他合约处理
    }

    /**
     * @dev 完成支付（由其他合约调用）
     */
    function completePayment(bytes32 paymentId) external nonReentrant {
        PaymentRecord storage payment = payments[paymentId];
        require(!payment.completed, "Payment already completed");
        require(
            msg.sender == paymentChannels[payment.method].channelAddress,
            "Unauthorized"
        );

        payment.completed = true;
        balances[payment.recipient] += payment.amount;
        emit PaymentCompleted(
            paymentId,
            payment.recipient,
            payment.amount
        );
    }

    /**
     * @dev 设置支付通道
     */
    function setPaymentChannel(
        PaymentMethod method,
        address channelAddress,
        bool isActive,
        uint256 priority,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyOwner {
        paymentChannels[method] = PaymentChannel({
            channelAddress: channelAddress,
            isActive: isActive,
            priority: priority,
            minAmount: minAmount,
            maxAmount: maxAmount
        });
    }

    /**
     * @dev 提取余额
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev 查询支付状态
     */
    function getPayment(bytes32 paymentId)
        external
        view
        returns (PaymentRecord memory)
    {
        return payments[paymentId];
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

    receive() external payable {
        // 接收ETH
    }
}

