interface Message {
    action: 'ping' | 'INIT_HOOKS' | 'CHECK_HOOKS' | 'START_VIS' | 'CHECK_VIS' | 'STOP_VIS' | 'SENSOR_UP' | 'SENSOR_DOWN' | 'VIDEO_PLAY' | 'VIDEO_PAUSE' | 'VIDEO_END' | 'ID_SET' | 'START_VIBRATION' | 'STOP_VIBRATION' | 'SET_VIBRATION';
    [k: string]: unknown;
}

interface MessageResponse {
    error: null | string;
    response?: unknown;
}

type AnimationType = 'lighting' | 'thermometer' | 'exclamation' | 'vibration';