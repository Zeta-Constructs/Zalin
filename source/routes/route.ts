/*

    route.ts
    versioned route prefix definitions

*/

import Elysia from "elysia"

// helper functions

export function CreateVersion<const V extends string>(version: V) {
    return <const N extends string>(name: N) =>
        new Elysia({
            prefix: `/${version}/${name}`,
            name: `${version}.${name}` // unique plugin name so Elysia dedupes correctly
        })
}

// versions

export const v1 = CreateVersion("v1")

/*
    v1 endpoints
*/

export const TunnelsV1 = v1("tunnels")
export const StatusV1 = v1("status")

// end
