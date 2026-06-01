"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMOTE_CONTROL_EVENTS = exports.REMOTE_CONTROL_FORBIDDEN = exports.REMOTE_CONTROL_WHITELIST = void 0;
exports.REMOTE_CONTROL_WHITELIST = [
    'desktop.computer-use.start',
    'desktop.computer-use.stop',
    'desktop.pro-mode.toggle',
    'desktop.aira-work-mode.start',
    'speaker.tts.broadcast',
    'speaker.white-noise.start',
    'speaker.stop',
    'watch.notifications.silence',
    'device.status.query',
];
exports.REMOTE_CONTROL_FORBIDDEN = [
    'device.shutdown',
    'app.data.clear',
    'wallet.config.modify',
];
exports.REMOTE_CONTROL_EVENTS = {
    EXECUTE: 'remote-control:execute',
    RUN: 'remote-control:run',
    ACK: 'remote-control:ack',
    NACK: 'remote-control:nack',
};
//# sourceMappingURL=remote-control.js.map