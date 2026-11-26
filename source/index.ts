/*

    Zalin
    impromptu tunneling service

*/

// imports

import Elysia from "elysia";
import Logger from "@/libraries/logger";
import Version from "@zalin/version";

import { Config } from "@/libraries/config";
import { Routes } from "@zalin/routes";
import { TunnelService } from "@/services/tunnel";

// check to see if the process is executing in development

if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
    Logger.warn("This process isn't running in production.");
}

// start background tunnel reaper & register routes

const App = Routes.RegisterRoutes(new Elysia()).listen({
    port: Config.Port,
    idleTimeout: 60,
});

TunnelService.StartReaper();

// final prints

Logger.info(`Welcome to Zalin v${Version.version}`);
Logger.info(`Listening on port "${App.server?.port ?? Config.Port}" (domain: ${Config.BaseDomain})`);

// end of file
