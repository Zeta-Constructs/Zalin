/*

    config.ts
    environment configuration

*/

import { randomBytes } from "crypto";

import Logger from "@/libraries/logger";
import { Sha256 } from "@/libraries/security";

// logger

const ConfigLog = Logger.child({ name: "Config" });

// config

const BaseDomain = (process.env.BASE_DOMAIN ?? "localhost").toLowerCase();
const InstanceSecret = randomBytes(32).toString("hex");

ConfigLog.info(`Instance secret: ${InstanceSecret}`);

export const Config = {
    Port: Number(process.env.PORT ?? 7000),
    BaseDomain,
    Scheme: process.env.SCHEME ?? (BaseDomain === "localhost" ? "http" : "https"),
    InstanceSecretHash: Sha256(InstanceSecret),
} as const;

// end
