# Hardware E2E Tests

> 测试 Watch / Toy (ESP32) / Glass 端的 BLE 通信和协议验证。

## 前置条件

### Watch 端
- 小天才 Android 手表通过 USB 连接
- ADB 已安装且可识别设备
- Agentrix WearOS companion APK 已安装

### Toy 端 (ESP32)
- ESP32-S3 开发板通过 USB 连接（串口通信）
- 烧录 ClawCore v1 最小固件（`shared/clawcore/v1/`）
- NTAG215 NFC 贴纸 × 10（已写入测试 token）

### Glass 端
- ESP32-S3 第二块（模拟 Glass GATT HUD 服务）
- 或使用 BLE 模拟器

## 运行

```bash
# 全部硬件测试
npm run test:hardware

# 仅 Watch
npm run test:hardware:watch

# 仅 Toy BLE
npm run test:hardware:toy

# 仅 Glass
npm run test:hardware:glass
```

## 测试报告

报告输出到 `tests/reports/hardware-YYYY-MM-DD/`
