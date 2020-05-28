/*
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { IrcAction } from "./IrcAction";

import ircFormatting = require("../irc/formatting");
const log = require("../logging").get("MatrixAction");
import { ContentRepo, Intent } from "matrix-appservice-bridge";
import escapeStringRegexp from "escape-string-regexp";

const ACTION_TYPES = ["message", "emote", "topic", "notice", "file", "image", "video", "audio"];
const EVENT_TO_TYPE: {[mxKey: string]: string} = {
    "m.room.message": "message",
    "m.room.topic": "topic"
};

const ACTION_TYPE_TO_MSGTYPE = {
    message: "m.text",
    emote: "m.emote",
    notice: "m.notice"
};

const MSGTYPE_TO_TYPE: {[mxKey: string]: string} = {
    "m.emote": "emote",
    "m.notice": "notice",
    "m.image": "image",
    "m.video": "video",
    "m.audio": "audio",
    "m.file": "file"
};

const PILL_MIN_LENGTH_TO_MATCH = 4;
const MAX_MATCHES = 5;

export interface MatrixMessageEvent {
    type: string;
    sender: string;
    room_id: string;
    event_id: string;
    content: {
        "m.relates_to"?: {
            "m.in_reply_to"?: {
                event_id: string;
            };
        };
        body?: string;
        topic?: string;
        format?: string;
        formatted_body?: string;
        msgtype: string;
        url?: string;
        info?: {
            size: number;
        };
    };
    origin_server_ts: number;
}

const MentionRegex = function(matcher: string): RegExp {
    const WORD_BOUNDARY = "^|\:|\#|```|\\s|$|,";
    return new RegExp(
        `(${WORD_BOUNDARY})(@?(${matcher}))(?=${WORD_BOUNDARY})`,
        "igm"
    );
}

export class MatrixAction {

    constructor(
        public readonly type: string,
        public text: string|null = null,
        public htmlText: string|null = null,
        public readonly ts: number = 0
        ) {
        if (ACTION_TYPES.indexOf(type) === -1) {
            throw new Error("Unknown MatrixAction type: " + type);
        }
    }

    public get msgType() {
        return (ACTION_TYPE_TO_MSGTYPE as {[key: string]: string|undefined})[this.type];
    }

    public async formatMentions(nickUserIdMap: {[nick: string]: string}, intent: Intent) {
        if (!this.text) {
            return;
        }
        const regexString = `(${Object.keys(nickUserIdMap).map((value) => escapeStringRegexp(value)).join("|")})`;
        const usersRegex = MentionRegex(regexString);
        const matched = new Set(); // lowercased nicknames we have matched already.
        let match;
        for (let i = 0; i < MAX_MATCHES && (match = usersRegex.exec(this.text)) !== null; i++) {
            let matchName = match[2];
            // Deliberately have a minimum length to match on,
            // so we don't match smaller nicks accidentally.
            if (matchName.length < PILL_MIN_LENGTH_TO_MATCH || matched.has(matchName.toLowerCase())) {
                continue;
            }
            let userId = nickUserIdMap[matchName];
            if (userId === undefined) {
                // We might need to search case-insensitive.
                const nick = Object.keys(nickUserIdMap).find((n) =>
                    n.toLowerCase() === matchName.toLowerCase()
                );
                if (nick === undefined) {
                    continue;
                }
                userId = nickUserIdMap[nick];
                matchName = nick;
            }
            // If this message is not HTML, we should make it so.
            if (!this.htmlText) {
                // This looks scary and unsafe, but further down we check
                // if `text` contains any HTML and escape + set `htmlText` appropriately.
                this.htmlText = this.text;
            }
            userId = ircFormatting.escapeHtmlChars(userId);

            /* Due to how Riot and friends do push notifications,
            we need the plain text to match something.*/
            let identifier;
            try {
                identifier = (await intent.getProfileInfo(userId, 'displayname', true)).displayname || undefined;
            }
            catch (e) {
                // This shouldn't happen, but let's not fail to match if so.
            }

            if (identifier === undefined) {
                // Fallback to userid.
                identifier = userId.substr(1, userId.indexOf(":")-1)
            }

            const regex = MentionRegex(escapeStringRegexp(matchName));
            this.htmlText = this.htmlText.replace(regex,
                `$1<a href="https://matrix.to/#/${userId}">`+
                `${ircFormatting.escapeHtmlChars(identifier)}</a>`
            );
            this.text = this.text.replace(regex, `$1${identifier}`);
            // Don't match this name twice, we've already replaced all entries.
            matched.add(matchName.toLowerCase());
        }
    }

    public static fromEvent(event: MatrixMessageEvent, mediaUrl: string) {
        event.content = event.content || {};
        let type = EVENT_TO_TYPE[event.type] || "message"; // mx event type to action type
        let text = event.content.body;
        let htmlText = null;

        if (event.type === "m.room.topic") {
            text = event.content.topic;
        }
        else if (event.type === "m.room.message") {
            if (event.content.format === "org.matrix.custom.html") {
                htmlText = event.content.formatted_body;
            }
            if (MSGTYPE_TO_TYPE[event.content.msgtype]) {
                type = MSGTYPE_TO_TYPE[event.content.msgtype];
            }
            const isFile = ["m.image", "m.file", "m.video", "m.audio"].includes(event.content.msgtype);
            if (isFile && event.content.url) {
                let mxc = event.content.url.slice(6);
                // TODO: take url from config
                let url = `https://u.pixie.town/${mxc}`;

                let filename = "";
                if (event.content.body) {
                    filename = `/${event.content.body}`;
                }
                text = `${url}${filename}`;
            }
        }
        return new MatrixAction(type, text, htmlText, event.origin_server_ts);
    }

    public static fromIrcAction(ircAction: IrcAction) {
        switch (ircAction.type) {
            case "message":
            case "emote":
            case "notice":
                const htmlText = ircFormatting.ircToHtml(ircAction.text);
                return new MatrixAction(
                    ircAction.type,
                    ircFormatting.stripIrcFormatting(ircAction.text),
                    // only set HTML text if we think there is HTML, else the bridge
                    // will send everything as HTML and never text only.
                    ircAction.text !== htmlText ? htmlText : undefined
                );
            case "topic":
                return new MatrixAction("topic", ircAction.text);
            default:
                log.error("MatrixAction.fromIrcAction: Unknown action: %s", ircAction.type);
                return null;
        }
    }
}
