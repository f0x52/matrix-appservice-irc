# Administrators Guide

This document describes useful information when administering a bridge.

## Advanced Configuration

Typically the information given in [Bridge Setup](./bridge_setup.md) is good enough for small
to medium sized bridges, but if you expect to handle extremely heavy IRC or Matrix traffic
then it might be looking at tweaking some of these options.

It should be noted that often the homeserver you have connected to the bridge will play a greater
role in the percieved performance of your bridge, as it is usually the bottleneck in either handing
(federated) traffic towards the bridge, or persisting and federating traffic from the bridge to users.

It is strongly advised that if you are suffering from performance issues, you should identify if there
are problems with your homeserver first.

### Quit Debouncing

[Setting documentation](https://github.com/matrix-org/matrix-appservice-irc/blob/develop/config.sample.yaml#L93)

This setting handles the "debouncing" of quits when the server sees an extreme amount of QUIT events
from the IRC server. IRC servers often suffer from [netsplits](https://en.wikipedia.org/wiki/Netsplit)
which manifest as many QUITs. The IRC bridge will handle one QUIT per *room*, so 5 users quitting from 5
rooms would manifest as 25 events. This can quickly overwhelm the bridge.

The quit debouner is often overkill for smaller bridges, but if you find that the bridge becomes overwhelmed
and unresponsive after a netsplit then it enabled. 

### Membership syncing

[Setting documentation](https://github.com/matrix-org/matrix-appservice-irc/blob/develop/config.sample.yaml#L222)

Typically it's wise to leave this setting on by default, as populating the memberlists on both sides of the
bridge leads to a more pleasant experience for users. However as the setting requires the constant adjustment
of the member lists on both sides of the bridge it can be more intensive on homeserver resources. You can
also adjust the membership settings of individual rooms or channels to lessen the effect.


## Hot Reloading

The bridge supports hot-reloading of the configuration file by sending a `SIGHUP` signal. Some configuration 
keys will not be reloaded as they are required to be static to avoid bridge instability. Unsupported keys are 
marked in [config.sample.yaml](https://github.com/matrix-org/matrix-appservice-irc/blob/develop/config.sample.yaml).
Hot reloading is useful as restarting the bridge will drop all IRC connections, so it's worth using this
method to avoid disruption.

Typically the process is as follows.

```sh
$ ps -A | grep 'node'
31960 pts/7    00:00:13 node
# and then send the SIGHUP signal
$ kill -SIGHUP 31960
```

The logs will then mention `Bridge config was reloaded, applying changes` which confirms
that the reload has taken place.

## Metrics / Grafana

The bridge includes a prometheus compatible metrics endpoint which can be used to inspect
the state of the bridge. The repository also includes a grafana dashboard; more information
can be found in [GRAFANA.md](https://github.com/matrix-org/matrix-appservice-irc/blob/develop/contrib/GRAFANA.md).

## The Debug API

The Debug API allows you to perform administrative actions on the bridge such as killing a IRC
connection, inspecting connected users or unbridging a room. The API is currently loosely documented
over in [the GitHub wiki]([https://github.com/matrix-org/matrix-appservice-irc/wiki/Debug-API).

This is not enabled by default.
