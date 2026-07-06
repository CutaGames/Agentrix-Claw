export declare const ARCADE: {
    readonly NAMESPACE: "/arcade";
    readonly JOIN: "arcade:join";
    readonly INPUT: "arcade:input";
    readonly LEAVE: "arcade:leave";
    readonly STATE: "arcade:state";
    readonly TICK_HZ: 30;
    readonly FIELD_W: 200;
    readonly FIELD_H: 120;
    readonly PADDLE_H: 28;
    readonly PADDLE_W: 4;
    readonly BALL_R: 3;
};
export type PongSide = 'l' | 'r' | 'spec';
export interface ArcadeJoinPayload {
    roomId: string;
    displayName: string;
}
export interface PongInput {
    dir: -1 | 0 | 1;
}
export interface PongState {
    ball: {
        x: number;
        y: number;
    };
    paddles: {
        l: number;
        r: number;
    };
    score: {
        l: number;
        r: number;
    };
    seats: {
        l: string | null;
        r: string | null;
    };
    you: PongSide;
    status: 'waiting' | 'playing' | 'point';
    occupants: number;
    tick: number;
    winner: PongSide | null;
}
export declare const PONG: {
    readonly WIN_SCORE: 11;
    readonly PADDLE_SPEED: 2.4;
    readonly BALL_SPEED_X: 2.2;
    readonly BALL_SPEED_Y_MAX: 2;
};
