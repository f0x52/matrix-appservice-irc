const envBundle = require("../util/env-bundle");
const BridgeEventType = require("matrix-appservice-bridge").BridgeInfoStateSyncer.EventType;

describe("Room upgrades", function() {
    const {env, roomMapping, botUserId, test} = envBundle();
    const testUser = {
        id: "@flibble:wibble",
        nick: "M-flibble"
    };

    beforeEach(async () => {
        await test.beforeEach(env);

        env.ircMock._autoConnectNetworks(
            roomMapping.server, testUser.nick, roomMapping.server
        );
        env.ircMock._autoJoinChannels(
            roomMapping.server, testUser.nick, roomMapping.channel
        );

        env.ircMock._autoConnectNetworks(
            roomMapping.server, roomMapping.botNick, roomMapping.server
        );
        env.ircMock._autoJoinChannels(
            roomMapping.server, roomMapping.botNick, roomMapping.channel
        );

        await test.initEnv(env);
    });

    afterEach(async () => {
        await test.afterEach(env);
    });
    it("should move the mapping to the new channel", async () => {
        const server = env.ircBridge.getServer(roomMapping.server);
        const members = ["testUser1", "testUser2", "testUser3"].map((n) => server.getUserIdFromNick(n));
        const allLeft = Promise.all(members.map(async (member) => {
            const memberClient = env.clientMock._client(member);
            return new Promise((resolve, reject) => {
                memberClient.leave.and.callFake((roomId) => {
                    try {
                        expect(roomId).toBe(roomMapping.roomId);
                        resolve();
                    } catch (ex) {
                        reject(ex);
                    }
                });
            })
        }));
        const sdk = env.clientMock._client(botUserId);
        const store = env.ircBridge.getStore();
        const newRoomId = "!new_room:bar.com";
        await env.mockAppService._trigger("type:m.room.tombstone", {
            content: {
                replacement_room: newRoomId,
            },
            room_id: roomMapping.roomId,
            sender: "@mr_upgrades:bar.com",
            event_id: "$original:bar.com",
            type: "m.room.tombstone",
            state_key: "",
        });


        await new Promise((resolve, reject) => {
            sdk.roomState.and.callFake(async (roomId) => {
                try {
                    expect(roomId).toEqual(roomMapping.roomId);
                    resolve();
                    return [
                        {
                            type: "m.room.bridging",
                            state_key: "",
                            content: {
                                some_state: true,
                            }
                        },
                        {
                            type: BridgeEventType,
                            state_key: "",
                            content: {
                                more_state: true,
                            }
                        },
                        {
                            sender: testUser.id,
                            state_key: testUser.id,
                            membership: "join",
                            content: {
                                membership: "join",
                            },
                            room_id: roomMapping.roomId,
                            type: "m.room.member",
                        }
                    ].concat(members.map((userId) => ({
                        sender: userId,
                        state_key: userId,
                        membership: "join",
                        content: {
                            membership: "join",
                        },
                        room_id: roomMapping.roomId,
                        type: "m.room.member",
                    })));
                }
                catch (ex) {
                    reject(ex);
                    throw ex;
                }
            });
        });

        const oldRoom = await store.getRoom(roomMapping.roomId, roomMapping.server, roomMapping.channel);
        const newRoom = await store.getRoom(newRoomId, roomMapping.server, roomMapping.channel);
        await allLeft;
        expect(oldRoom).toBeNull();
        expect(newRoom.id).toEqual(`${newRoomId} ${roomMapping.server} ${roomMapping.channel}`);
        expect(newRoom.remote.get("domain")).toEqual(roomMapping.server);
        expect(newRoom.remote.get("channel")).toEqual(roomMapping.channel);
        expect(newRoom.remote.get("type")).toEqual("channel");
    });
});
