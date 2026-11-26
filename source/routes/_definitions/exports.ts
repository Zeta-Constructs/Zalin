/*

    exports.ts
    exports for all of the routes & plugins + registration helpers

*/

// routes

import { Tunnels } from "@/routes/tunnels/v1";

// plugins

import { websocket } from "elysia/websocket";
import { Gateway } from "@/routes/plugins/gateway";

// imports

import type Elysia from "elysia";
import Logger from "@/libraries/logger";
import { TunnelService } from "@/services/tunnel";

// logger

const RouteLog = Logger.child({ name: "Routes" });

// exports

export class Routes {
    // routes
    public static readonly TunnelAPIs = [Tunnels] as const;

    // plugins
    public static readonly Plugins = [
        websocket({
            idleTimeout: 60,
            maxPayloadLength: TunnelService.MaxPayloadLength,
        }),
        Gateway,
    ] as const;

    // all routes
    public static readonly All = [
        ...Routes.TunnelAPIs,
    ] as const;

    // methods

    public static RegisterRoutes(App: Elysia) {
        for (const plugin of Routes.Plugins) {
            const config = plugin["~config"];
            const name = config?.name ?? "plugin";

            RouteLog.info(`Starting registering for plugin: ${name}`);

            try {
                App.use(plugin);
                RouteLog.info(`Successfully registered plugin: ${name}`);
            } catch (Error) {
                RouteLog.error(`Failed to register plugin "${name}"`);
                throw Error;
            }
        }

        for (const route of Routes.All) {
            const config = route["~config"];
            const name = config?.name ?? config?.prefix ?? "unnamed";

            RouteLog.info(`Starting registration for route: ${name}`);

            try {
                App.use(route);
                RouteLog.info(`Successfully registered route: ${name}`);
            } catch (Error) {
                RouteLog.error(`Failed to register route "${name}"`);
                throw Error;
            }
        }

        RouteLog.info("Registered all routes!");

        return App;
    }
}

// end
