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
    redis: {
        host: string;
        port: number;
        password: string | undefined;
    };
    session: {
        secret: string;
        ttl: number;
    };
    jwt: {
        issuer: string;
        accessTtl: number;
        refreshTtl: number;
        privateKeyPath: string;
        publicKeyPath: string;
        privateKey: string;
        publicKey: string;
    };
    smtp: {
        host: string;
        port: number;
        user: string;
        pass: string;
        from: string;
    };
    cors: {
        origin: string;
    };
    cookie: {
        domain: string;
        secret: string;
    };
};
//# sourceMappingURL=index.d.ts.map