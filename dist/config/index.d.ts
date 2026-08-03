export declare const config: {
    port: number;
    nodeEnv: string;
    db: {
        host: string;
        port: number;
        user: string;
        password: string;
        name: string;
    };
    jwt: {
        issuer: string;
        accessTtl: number;
        refreshTtl: number;
        keysDir: string;
        privateKeyPath: string;
        publicKeyPath: string;
        privateKey: string;
        publicKey: string;
    };
    tokens: {
        resetTtl: number;
        verifyTtl: number;
    };
    requireEmailVerification: boolean;
    lockout: {
        threshold: number;
        durationSeconds: number;
    };
    smtp: {
        host: string;
        port: number;
        user: string;
        pass: string;
        from: string;
    };
    links: {
        resetUrl: string;
        verifyUrl: string;
    };
    serviceSecret: string;
    cors: {
        origin: string;
    };
};
//# sourceMappingURL=index.d.ts.map