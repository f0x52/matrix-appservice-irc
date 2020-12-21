const Promise = require("bluebird");

const envBundle = require("../util/env-bundle");

describe("Kicking", function() {

    const {env, config, test} = envBundle();

    const mxUser = {
        id: "@flibble:wibble",
        nick: "M-flibble"
    };

    const ircUser = {
        nick: "bob",
        localpart: config._server + "_bob",
        id: "@" + config._server + "_bob:" + config.homeserver.domain
    };

    const ircUserKicker = {
        nick: "KickerNick",
        localpart: config._server + "_KickerNick",
        id: "@" + config._server + "_KickerNick:" + config.homeserver.domain
    };

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);

        // accept connection requests from eeeeeeeeveryone!
        env.ircMock._autoConnectNetworks(
            config._server, mxUser.nick, config._server
        );
        env.ircMock._autoConnectNetworks(
            config._server, ircUser.nick, config._server
        );
        env.ircMock._autoConnectNetworks(
            config._server, config._botnick, config._server
        );
        // accept join requests from eeeeeeeeveryone!
        env.ircMock._autoJoinChannels(
            config._server, mxUser.nick, config._chan
        );
        env.ircMock._autoJoinChannels(
            config._server, ircUser.nick, config._chan
        );
        env.ircMock._autoJoinChannels(
            config._server, config._botnick, config._chan
        );

        // we also don't care about registration requests for the irc user
        env.clientMock._client(ircUser.id)._onHttpRegister({
            expectLocalpart: ircUser.localpart,
            returnUserId: ircUser.id
        });

        // do the init
        yield test.initEnv(env).then(function() {
            // make the matrix user be on IRC
            return env.mockAppService._trigger("type:m.room.message", {
                content: {
                    body: "let me in",
                    msgtype: "m.text"
                },
                user_id: mxUser.id,
                room_id: config._roomid,
                type: "m.room.message"
            })
        }).then(function() {
            return env.ircMock._findClientAsync(config._server, config._botnick);
        }).then(function(botIrcClient) {
            // make the IRC user be on Matrix
            botIrcClient.emit("message", ircUser.nick, config._chan, "let me in");
        })
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    describe("IRC users on IRC", function() {
        it("should make the kickee leave the Matrix room", async () => {
            const kickReason = "They had to go, they knew too much";
            const kickPromise = new Promise((resolve) => {
                const ircUserSdk = env.clientMock._client(ircUserKicker.id);
                ircUserSdk.kick.and.callFake(async (roomId, kickee, reason) => {
                    expect(roomId).toEqual(config._roomid);
                    expect(kickee).toEqual(ircUser.id);
                    expect(reason).toEqual(kickReason)
                    resolve();
                });
            });

            // send the KICK command
            const ircUserCli = await env.ircMock._findClientAsync(
                config._server, config._botnick
            );
            ircUserCli.emit("kick", config._chan, ircUser.nick, ircUserKicker.nick, kickReason);
            await kickPromise;
        });
    });

    describe("Matrix users on Matrix", function() {
        it("should make the kickee part the IRC channel", test.coroutine(function*() {
            let parted = false;
            env.ircMock._whenClient(config._server, mxUser.nick, "part",
            function(client, channel, msg, cb) {
                expect(client.nick).toEqual(mxUser.nick);
                expect(client.addr).toEqual(config._server);
                expect(channel).toEqual(config._chan);
                expect(msg.indexOf("@the_kicker:localhost")).not.toEqual(-1,
                    "Part message doesn't contain kicker's user ID");
                parted = true;
                client._invokeCallback(cb);
            });

            yield env.mockAppService._trigger("type:m.room.member", {
                content: {
                    membership: "leave"
                },
                user_id: "@the_kicker:localhost",
                state_key: mxUser.id,
                room_id: config._roomid,
                type: "m.room.member"
            });
            expect(parted).toBe(true, "Didn't part");
        }));
    });

    describe("Matrix users on IRC", function() {
        it("should make the AS bot kick the Matrix user from the Matrix room", async () => {
            let userKickedPromise = new Promise(function(resolve) {
                // assert function call when the bot attempts to kick
                let botSdk = env.clientMock._client(config._botUserId);
                botSdk.kick.and.callFake(function(roomId, userId, reason) {
                    expect(roomId).toEqual(config._roomid);
                    expect(userId).toEqual(mxUser.id);
                    expect(reason.indexOf("KickerNick")).not.toEqual(-1,
                        "Reason doesn't contain the kicker's nick");
                    resolve();
                    return Promise.resolve();
                });
            });

            // send the KICK command
            let botCli = await env.ircMock._findClientAsync(
                config._server, config._botnick
            );
            botCli.emit("kick", config._chan, mxUser.nick, "KickerNick", "Reasons");
            await userKickedPromise;
        });
    });

    describe("IRC users on Matrix", function() {
        it("should make the virtual IRC client KICK the real IRC user",
        test.coroutine(function*() {
            let reason = "they are a fish";
            let userKickedPromise = new Promise(function(resolve, reject) {
                env.ircMock._whenClient(config._server, mxUser.nick, "send",
                function(client, cmd, chan, nick, kickReason) {
                    expect(client.nick).toEqual(mxUser.nick);
                    expect(client.addr).toEqual(config._server);
                    expect(nick).toEqual(ircUser.nick);
                    expect(chan).toEqual(config._chan);
                    expect(cmd).toEqual("KICK");
                    expect(kickReason.indexOf(reason)).not.toEqual(-1,
                        `kick reason was not mirrored to IRC. Got '${kickReason}',
                        expected '${reason}'.`);
                    resolve();
                });
            });

            yield env.mockAppService._trigger("type:m.room.member", {
                content: {
                    reason: reason,
                    membership: "leave"
                },
                user_id: mxUser.id,
                state_key: ircUser.id,
                room_id: config._roomid,
                type: "m.room.member"
            });
            yield userKickedPromise;
        }));
    });
});


describe("Kicking on IRC join", function() {

    const {env, config, test} = envBundle();

    const mxUser = {
        id: "@flibble:wibble",
        nick: "M-flibble"
    };

    const ircUser = {
        nick: "bob",
        localpart: config._server + "_bob",
        id: "@" + config._server + "_bob:" + config.homeserver.domain
    };

    beforeEach(test.coroutine(function*() {
        yield test.beforeEach(env);
        config.ircService.servers[config._server].membershipLists.enabled = true;
        config.ircService.servers[
            config._server
        ].membershipLists.global.matrixToIrc.incremental = true;

        // accept connection requests from eeeeeeeeveryone!
        env.ircMock._autoConnectNetworks(
            config._server, mxUser.nick, config._server
        );
        env.ircMock._autoConnectNetworks(
            config._server, ircUser.nick, config._server
        );
        env.ircMock._autoConnectNetworks(
            config._server, config._botnick, config._server
        );
        // accept join requests from eeeeeeeeveryone!
        env.ircMock._autoJoinChannels(
            config._server, mxUser.nick, config._chan
        );
        env.ircMock._autoJoinChannels(
            config._server, ircUser.nick, config._chan
        );
        env.ircMock._autoJoinChannels(
            config._server, config._botnick, config._chan
        );

        // we also don't care about registration requests for the irc user
        env.clientMock._client(ircUser.id)._onHttpRegister({
            expectLocalpart: ircUser.localpart,
            returnUserId: ircUser.id
        });

        yield test.initEnv(env);
    }));

    afterEach(test.coroutine(function*() {
        yield test.afterEach(env);
    }));

    it("should be done for err_needreggednick",
    test.coroutine(function*() {
        let userKickedPromise = new Promise(function(resolve, reject) {
            // assert function call when the bot attempts to kick
            let botSdk = env.clientMock._client(config._botUserId);
            botSdk.kick.and.callFake(function(roomId, userId, reason) {
                expect(roomId).toEqual(config._roomid);
                expect(userId).toEqual(mxUser.id);
                resolve();
                return Promise.resolve();
            });
        });

        // when the matrix user tries to join the channel, error them.
        let ircErrorPromise = new Promise(function(resolve, reject) {
            env.ircMock._whenClient(config._server, mxUser.nick, "join",
            function(client, channel, msg, cb) {
                expect(client.nick).toEqual(mxUser.nick);
                expect(client.addr).toEqual(config._server);
                expect(channel).toEqual(config._chan);
                client.emit("error", {
                    command: "err_needreggednick",
                    args: [config._chan]
                });
                resolve();
            });
        });


        // make matrix user attempt to join the channel
        try {
            yield env.mockAppService._trigger("type:m.room.member", {
                content: {
                    membership: "join"
                },
                user_id: mxUser.id,
                state_key: mxUser.id,
                room_id: config._roomid,
                type: "m.room.member"
            });
        }
        catch (err) {
            // ignore, other promises check what should happen
        }

        // wait for the error to be sent
        yield ircErrorPromise;

        // wait for the bridge to kick the matrix user
        yield userKickedPromise;
    }));
});
