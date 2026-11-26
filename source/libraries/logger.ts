/*

   logger.ts
   handles outputs sent to the terminal

*/

import stripAnsi from "strip-ansi";
import winston from "winston";

import { stringWidth } from "bun";

import picocolors from "picocolors";
import type { Colors } from "picocolors/types";

// interface

interface Detail {
    [key: string]: {
        icon?: string;
        color?: keyof Omit<Colors, "isColorSupported">;
        display?: string;
    } | undefined;
}

// config

const LevelOfDetail: Detail = {
    // error
    error: {
        icon: "×",
        color: "red"
    },
    // warning
    warn: {
        icon: "⚠",
        color: "yellow"
    },
    // information
    info: {
        icon: "ℹ",
        color: "blue"
    },
    // http output
    http: {
        icon: "🖧",
        color: "magenta"
    },
    // verbose
    verbose: {
        icon: "»",
        color: "cyan",
        display: "VRBSE"
    },
    // debugging
    debug: {
        icon: "🛠",
        color: "green"
    },
    // wtf is silly
    silly: {
        icon: "∵",
        color: "green"
    },
}

// logger inst

const Logger = winston.createLogger({
    level: "silly", // copied this from doqe
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
});

Logger.add(
    new winston.transports.Console({
        format: winston.format.printf(({ timestamp, level, message, fix, name }) => {
            const Time = new Date(String(timestamp))
                .toTimeString()
                .split(" ")
                .shift();

            const Information = LevelOfDetail[level];
            const Display = Information?.display || level;

            const Prefix = PadRight((Information?.icon ? `${Information.icon} ` : "") + (`${Display.toUpperCase()}`), 7)
            const TimeAndPrefix = `${picocolors.dim(`[${Time}]`)} ${picocolors.bold(Information?.color ? picocolors[Information.color](Prefix) : Prefix)}`

            return `${TimeAndPrefix} ${picocolors.dim("|")} ${name ? `${picocolors.dim(`${name}:`)} ` : ""}${message}${fix && level === "error" ? ` (${fix})` : ""}`
        })
    })
)

// function

function PadRight(string : string, length: number) {
    const Visible = stringWidth(stripAnsi(string));

    return Visible >= length
        ? string
        : string + (" ").repeat(length - Visible)
}

// exports

export default Logger
