// WristTapHandler.swift
// Detects "raise wrist + hold 1s" via CoreMotion and forwards a wrist_trigger
// to the paired phone via WCSession. Phone executes the L2 biometric flow.

import CoreMotion
import WatchKit

final class WristTapHandler {
    static let shared = WristTapHandler()
    private let motion = CMMotionManager()
    private var holdStart: Date? = nil

    private init() {}

    func start(session: WatchSessionStore) {
        guard motion.isAccelerometerAvailable else { return }
        motion.accelerometerUpdateInterval = 0.1
        motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self = self, let acc = data else { return }
            // Heuristic: z near +1 (face up) sustained for 1s while pending approval exists
            let isWristUp = abs(acc.acceleration.z + 1) < 0.25
            if isWristUp && session.pendingApprovalId != nil {
                if self.holdStart == nil {
                    self.holdStart = Date()
                } else if Date().timeIntervalSince(self.holdStart!) >= 1.0 {
                    if let id = session.pendingApprovalId {
                        WKInterfaceDevice.current().play(.click)
                        session.sendWristTrigger(approvalId: id)
                    }
                    self.holdStart = nil
                }
            } else {
                self.holdStart = nil
            }
        }
    }

    func stop() {
        motion.stopAccelerometerUpdates()
    }
}
