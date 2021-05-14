/*
 * Contains integration tests for private messages.
 */
"use strict";
const Promise = require("bluebird");
const envBundle = require("../util/env-bundle");

describe("Matrix-to-IRC PMing", function() {

    const {env, config, roomMapping, test} = envBundle();

    let tUserId = "@flibble:wibble";
    let tIrcNick = "someone";
    let tUserLocalpart = roomMapping.server + "_" + tIrcNick;
    let tIrcUserId = "@" + tUserLocalpart + ":" + config.homeserver.domain;

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);

        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        yield test.initEnv(env);
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should join 1:1 rooms invited from matrix",
    test.coroutine(function*() {
        // get the ball rolling
        let requestPromise = env.mockAppService._trigger("type:m.room.member", {
            content: {
                membership: "invite",
                is_direct: true,
            },
            state_key: tIrcUserId,
            user_id: tUserId,
            room_id: roomMapping.roomId,
            type: "m.room.member"
        });

        // when it queries whois, say they exist
        env.ircMock._whenClient(roomMapping.server, roomMapping.botNick, "whois",
        function(client, nick, cb) {
            expect(nick).toEqual(tIrcNick);
            // say they exist (presence of user key)
            cb({
                user: tIrcNick,
                nick: tIrcNick
            });
        });

        // when it tries to register, join the room and get state, accept them
        let sdk = env.clientMock._client(tIrcUserId);
        sdk._onHttpRegister({
            expectLocalpart: tUserLocalpart,
            returnUserId: tIrcUserId
        });

        let joinRoomPromise = new Promise((resolve, reject) => {
            sdk.joinRoom.and.callFake(function(roomId) {
                expect(roomId).toEqual(roomMapping.roomId);
                resolve();
                return Promise.resolve({});
            });
        });

        yield joinRoomPromise;
        yield requestPromise;
    }));

    it("should join group chat rooms invited from matrix then leave them",
    test.coroutine(function*() {
        const expectedReason = "Group chat not supported.";
        // get the ball rolling
        const requestPromise = env.mockAppService._trigger("type:m.room.member", {
            content: {
                membership: "invite",
            },
            state_key: tIrcUserId,
            user_id: tUserId,
            room_id: roomMapping.roomId,
            type: "m.room.member"
        });

        // when it queries whois, say they exist
        env.ircMock._whenClient(roomMapping.server, roomMapping.botNick, "whois",
        function(client, nick, cb) {
            expect(nick).toEqual(tIrcNick);
            // say they exist (presence of user key)
            cb({
                user: tIrcNick,
                nick: tIrcNick
            });
        });

        // when it tries to register, join the room and get state, accept them
        const sdk = env.clientMock._client(tIrcUserId);
        sdk._onHttpRegister({
            expectLocalpart: tUserLocalpart,
            returnUserId: tIrcUserId
        });

        // when it tries to join, accept it
        const joinRoomPromise = new Promise((resolve) => {
            sdk.joinRoom.and.callFake(function(roomId) {
                expect(roomId).toEqual(roomMapping.roomId);
                resolve();
                return Promise.resolve({});
            });
        });

        // when it tries to leave, accept it
        const kickPromise = new Promise((resolve) => {
            sdk.kick.and.callFake(function(roomId, userId, reason) {
                expect(roomId).toEqual(roomMapping.roomId);
                expect(userId).toEqual(tIrcUserId);
                expect(reason).toEqual(expectedReason);
                resolve();
                return Promise.resolve({});
            });
        });


        // wait on things to happen
        yield joinRoomPromise;
        yield kickPromise;
        yield requestPromise;
    }));
});

describe("Matrix-to-IRC PMing disabled", function() {
    const {env, config, roomMapping, test} = envBundle();

    let tUserId = "@flibble:wibble";
    let tIrcNick = "someone";
    let tUserLocalpart = roomMapping.server + "_" + tIrcNick;
    let tIrcUserId = "@" + tUserLocalpart + ":" + config.homeserver.domain;

    beforeEach(test.coroutine(function*() {
        config.ircService.servers[roomMapping.server].privateMessages.enabled = false;
        yield test.beforeEach(env);

        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        yield test.initEnv(env);
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
        config.ircService.servers[roomMapping.server].privateMessages.enabled = true;
    }));

    it("should join 1:1 rooms invited from matrix, announce and then leave them",
    test.coroutine(function*() {
        // get the ball rolling
        let requestPromise = env.mockAppService._trigger("type:m.room.member", {
            content: {
                membership: "invite",
                is_direct: true,
            },
            state_key: tIrcUserId,
            user_id: tUserId,
            room_id: roomMapping.roomId,
            type: "m.room.member"
        });

        // when it queries whois, say they exist
        env.ircMock._whenClient(roomMapping.server, roomMapping.botNick, "whois",
        function(client, nick, cb) {
            expect(nick).toEqual(tIrcNick);
            // say they exist (presence of user key)
            cb({
                user: tIrcNick,
                nick: tIrcNick
            });
        });

        let sdk = env.clientMock._client(tIrcUserId);
        sdk._onHttpRegister({
            expectLocalpart: tUserLocalpart,
            returnUserId: tIrcUserId
        });

        let joinRoomPromise = new Promise((resolve, reject) => {
            sdk.joinRoom.and.callFake(function(roomId) {
                expect(roomId).toEqual(roomMapping.roomId);
                resolve();
                return Promise.resolve({});
            });
        });

        let sentMessagePromise = new Promise(function(resolve, reject) {
            sdk.sendEvent.and.callFake(function(roomId, type, content) {
                expect(roomId).toEqual(roomMapping.roomId);
                expect(type).toEqual("m.room.message");
                resolve();
                return Promise.resolve({});
            });
        });

        let leaveRoomPromise = new Promise((resolve, reject) => {
            sdk.leave.and.callFake(function(roomId) {
                expect(roomId).toEqual(roomMapping.roomId);
                resolve();
                return Promise.resolve({});
            });
        });

        yield joinRoomPromise;
        yield sentMessagePromise;
        yield leaveRoomPromise;
        yield requestPromise;
    }));
});

describe("IRC-to-Matrix PMing", function() {
    const {env, config, roomMapping, test} = envBundle();
    let sdk = null;

    let tRealIrcUserNick = "bob";
    let tVirtualUserId = "@" + roomMapping.server + "_" + tRealIrcUserNick + ":" +
                          config.homeserver.domain;

    let tRealMatrixUserNick = "M-alice";
    let tRealUserId = "@alice:anotherhomeserver";

    let tCreatedRoomId = "!fehwfweF:fuiowehfwe";

    let tText = "ello ello ello";

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);
        sdk = env.clientMock._client(tVirtualUserId);

        // add registration mock impl:
        // registering should be for the REAL irc user
        sdk._onHttpRegister({
            expectLocalpart: roomMapping.server + "_" + tRealIrcUserNick,
            returnUserId: tVirtualUserId
        });

        // let the user join when they send a message
        env.ircMock._autoConnectNetworks(
            roomMapping.server, tRealMatrixUserNick, roomMapping.server
        );
        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        env.ircMock._autoJoinChannels(
            roomMapping.server, tRealMatrixUserNick, roomMapping.channel
        );

        // do the init
        yield test.initEnv(env).then(function() {
            // send a message in the linked room (so the service provisions a
            // virtual IRC user which the 'real' IRC users can speak to)
            return env.mockAppService._trigger("type:m.room.message", {
                content: {
                    body: "get me in",
                    msgtype: "m.text"
                },
                user_id: tRealUserId,
                room_id: roomMapping.roomId,
                type: "m.room.message"
            });
        });
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should create a 1:1 matrix room and invite the real matrix user when " +
    "it receives a PM directed at a virtual user from a real IRC user",
    test.coroutine(function*() {
        // mock create room impl
        const createRoomPromise = new Promise(function(resolve) {
            sdk.createRoom.and.callFake(function(opts) {
                expect(opts.visibility).toEqual("private");
                expect(opts.creation_content["m.federate"]).toEqual(true);
                expect(opts.preset).not.toBeDefined();
                expect(opts.initial_state).toEqual([{
                    type: "m.room.power_levels",
                    state_key: "",
                    content: {
                        users: {
                            "@alice:anotherhomeserver": 10,
                            "@irc.example_bob:some.home.server": 100
                        },
                        events: {
                            "m.room.avatar": 10,
                            "m.room.name": 10,
                            "m.room.canonical_alias": 100,
                            "m.room.history_visibility": 100,
                            "m.room.power_levels": 100,
                            "m.room.encryption": 100
                        },
                        invite: 100
                    },
                }]);
                resolve();
                return Promise.resolve({
                    room_id: tCreatedRoomId
                });
            });
        });

        // mock send message impl
        let sentMessagePromise = new Promise(function(resolve, reject) {
            sdk.sendEvent.and.callFake(function(roomId, type, content) {
                expect(roomId).toEqual(tCreatedRoomId);
                expect(type).toEqual("m.room.message");
                expect(content).toEqual({
                    body: tText,
                    msgtype: "m.text"
                });
                resolve();
                return Promise.resolve({});
            });
        });

        // find the *VIRTUAL CLIENT* (not the bot) and send the irc message
        let client = yield env.ircMock._findClientAsync(
            roomMapping.server, tRealMatrixUserNick
        );
        client.emit(
            "message", tRealIrcUserNick, tRealMatrixUserNick, tText
        );

        yield createRoomPromise;
        yield sentMessagePromise;
    }));

    it("should not create multiple matrix rooms when several PMs are received in quick succession",
    test.coroutine(function*() {
        let count = 0;
        // mock create room impl
        let createRoomPromise = new Promise(function(resolve, reject) {
            sdk.createRoom.and.callFake(function(opts) {
                count++;
                expect(count).toEqual(1);
                resolve();
                return Promise.resolve({
                    room_id: tCreatedRoomId
                });
            });
        });
        let MESSAGE_COUNT = 10;
        let receivedMessageCount = 0;

        // mock send message impl
        let sentMessagePromise = new Promise(function(resolve, reject) {
            sdk.sendEvent.and.callFake(() => {
                receivedMessageCount++;
                if (receivedMessageCount === MESSAGE_COUNT) {
                    resolve();
                }
            });
        });

        // find the *VIRTUAL CLIENT* (not the bot) and send the irc message
        let client = yield env.ircMock._findClientAsync(
            roomMapping.server, tRealMatrixUserNick
        );

        // Send several messages, almost at once, to simulate a race
        for (let i = 0; i < MESSAGE_COUNT; i++) {
            client.emit("message", tRealIrcUserNick, tRealMatrixUserNick, tText);
        }

        yield createRoomPromise;
        yield sentMessagePromise;
    }));
});

describe("IRC-to-Matrix Non-Federated PMing", function() {
    const {env, config, roomMapping, test} = envBundle();

    let sdk = null;

    let tRealIrcUserNick = "bob";
    let tVirtualUserId = "@" + roomMapping.server + "_" + tRealIrcUserNick + ":" +
                          config.homeserver.domain;

    let tRealMatrixUserNick = "M-alice";
    let tRealUserId = "@alice:anotherhomeserver";

    let tCreatedRoomId = "!fehwfweF:fuiowehfwe";

    let tText = "ello ello ello";

    beforeEach(test.coroutine(function*() {
        config.ircService.servers[roomMapping.server].privateMessages.federate = false;
        yield test.beforeEach(env);
        sdk = env.clientMock._client(tVirtualUserId);

        // add registration mock impl:
        // registering should be for the REAL irc user
        sdk._onHttpRegister({
            expectLocalpart: roomMapping.server + "_" + tRealIrcUserNick,
            returnUserId: tVirtualUserId
        });

        // let the user join when they send a message
        env.ircMock._autoConnectNetworks(
            roomMapping.server, tRealMatrixUserNick, roomMapping.server
        );
        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        env.ircMock._autoJoinChannels(
            roomMapping.server, tRealMatrixUserNick, roomMapping.channel
        );

        // do the init
        yield test.initEnv(env).then(function() {
            // send a message in the linked room (so the service provisions a
            // virtual IRC user which the 'real' IRC users can speak to)
            return env.mockAppService._trigger("type:m.room.message", {
                content: {
                    body: "get me in",
                    msgtype: "m.text"
                },
                user_id: tRealUserId,
                room_id: roomMapping.roomId,
                type: "m.room.message"
            });
        });
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should create a non-federated 1:1 matrix room and invite the real matrix user when " +
    "it receives a PM directed at a virtual user from a real IRC user",
    test.coroutine(function*() {
        // mock create room impl
        let createRoomPromise = new Promise(function(resolve, reject) {
            sdk.createRoom.and.callFake(function(opts) {
                expect(opts.visibility).toEqual("private");
                expect(opts.creation_content["m.federate"]).toEqual(false);
                resolve();
                return Promise.resolve({
                    room_id: tCreatedRoomId
                });
            });
        });

        // mock send message impl
        let sentMessagePromise = new Promise(function(resolve, reject) {
            sdk.sendEvent.and.callFake(function(roomId, type, content) {
                expect(roomId).toEqual(tCreatedRoomId);
                expect(type).toEqual("m.room.message");
                expect(content).toEqual({
                    body: tText,
                    msgtype: "m.text"
                });
                resolve();
                return Promise.resolve({});
            });
        });

        // find the *VIRTUAL CLIENT* (not the bot) and send the irc message
        let client = yield env.ircMock._findClientAsync(
            roomMapping.server, tRealMatrixUserNick
        );
        client.emit(
            "message", tRealIrcUserNick, tRealMatrixUserNick, tText
        );

        yield createRoomPromise;
        yield sentMessagePromise;
    }));
});

describe("Matrix-to-IRC PMing over federation disabled", function() {
    const {env, config, roomMapping, test} = envBundle();

    let tUserId = "@flibble:wobble";
    let tIrcNick = "someone";
    let tUserLocalpart = roomMapping.server + "_" + tIrcNick;
    let tIrcUserId = "@" + tUserLocalpart + ":" + config.homeserver.domain;

    beforeEach(test.coroutine(function*() {
        config.ircService.servers[roomMapping.server].privateMessages.federate = false;
        yield test.beforeEach(env);

        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );

        yield test.initEnv(env);
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
        config.ircService.servers[roomMapping.server].privateMessages.federate = true;
    }));

    it("should join 1:1 rooms invited from matrix, announce and then leave them",
    test.coroutine(function*() {
        // get the ball rolling
        let requestPromise = env.mockAppService._trigger("type:m.room.member", {
            content: {
                membership: "invite",
                is_direct: true,
            },
            state_key: tIrcUserId,
            user_id: tUserId,
            room_id: roomMapping.roomId,
            type: "m.room.member"
        });

        // when it queries whois, say they exist
        env.ircMock._whenClient(roomMapping.server, roomMapping.botNick, "whois",
        function(client, nick, cb) {
            expect(nick).toEqual(tIrcNick);
            // say they exist (presence of user key)
            cb({
                user: tIrcNick,
                nick: tIrcNick
            });
        });

        let sdk = env.clientMock._client(tIrcUserId);
        sdk._onHttpRegister({
            expectLocalpart: tUserLocalpart,
            returnUserId: tIrcUserId
        });

        let joinRoomPromise = new Promise((resolve, reject) => {
            sdk.joinRoom.and.callFake(function(roomId) {
                expect(roomId).toEqual(roomMapping.roomId);
                resolve();
                return Promise.resolve({});
            });
        });

        let sentMessagePromise = new Promise(function(resolve, reject) {
            sdk.sendEvent.and.callFake(function(roomId, type, content) {
                expect(roomId).toEqual(roomMapping.roomId);
                expect(type).toEqual("m.room.message");
                resolve();
                return Promise.resolve({});
            });
        });

        let leaveRoomPromise = new Promise((resolve, reject) => {
            sdk.leave.and.callFake(function(roomId) {
                expect(roomId).toEqual(roomMapping.roomId);
                resolve();
                return Promise.resolve({});
            });
        });

        yield joinRoomPromise;
        yield sentMessagePromise;
        yield leaveRoomPromise;
        yield requestPromise;
    }));
});
