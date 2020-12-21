import { IrcServerConfig } from "../irc/IrcServer";
import { LoggerConfig } from "../logging";
import { IrcHandlerConfig } from "../bridge/IrcHandler";

export interface BridgeConfig {
    matrixHandler: {

    };
    ircHandler?: IrcHandlerConfig;
    database: {
        engine: string;
        connectionString: string;
    };
    homeserver: {
        url: string;
        media_url?: string;
        domain: string;
        enablePresence?: boolean;
        dropMatrixMessagesAfterSecs?: number;
        bindHostname: string|undefined;
        bindPort: number|undefined;
    };
    ircService: {
        servers: {[domain: string]: IrcServerConfig};
        provisioning: {
            enabled: boolean;
            requestTimeoutSeconds: number;
            ruleFile: string;
            enableReload: boolean;
            roomLimit?: number;
        };
        logging: LoggerConfig;
        debugApi: {
            enabled: boolean;
            port: number;
        };
        /** @deprecated Use `BridgeConfig.database` */
        databaseUri?: string;
        metrics?: {
            enabled: boolean;
            port?: number;
            host?: string;
            userActivityThresholdHours?: number;
            remoteUserAgeBuckets: string[];
        };
        passwordEncryptionKeyPath?: string;
        ident: {
            enabled: boolean;
            address: string;
            port: number;
        };
        bridgeInfoState?: {
            enabled: boolean;
            initial: boolean;
        };
        encodingFallback: string;
    };
    sentry?: {
        enabled: boolean;
        dsn: string;
        environment?: string;
        serverName?: string;
    };
    advanced: {
        maxHttpSockets: number;
        maxTxnSize?: number;
    };
}
