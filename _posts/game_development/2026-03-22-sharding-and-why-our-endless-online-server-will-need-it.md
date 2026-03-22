---
layout: post
title: "Sharding, and Why Our Endless Online Server Will Need It"
date: 2026-03-22
category: game_development
---

Right now, our [Endless Online Haskell server](https://github.com/jessjessjade12-cyber/taekserv) is intentionally simple, and that simplicity is a strength. It is easy to reason about, easy to run, and a great foundation for protocol work. But as soon as we think about scaling to higher player counts, we can already see architectural pressure points that suggest a future move toward sharding.

Our current connection model is thread-per-client. In `app/Main.hs`, each accepted socket creates a client environment and spawns a thread:

```haskell
acceptLoop listener nextPlayerId cfg stateRef =
  forever $ do
    (clientSock, clientAddr) <- accept listener
    ...
    let env = ClientEnv { ..., envServer = stateRef, ... }
    void (forkIO (runClient env))
```

This is fine for early development. The challenge is not thread creation by itself, but the fact that many client actions still converge on shared global state.

For example, walk updates mutate shared state and then broadcast:

```haskell
modifyMVar_ (envServer env) $ \ss ->
  pure (updateOnlineCharacter (envPlayerId env)
          (\c -> c { charX = newX, charY = newY, charDirection = dir }) ss)
...
broadcastToOthers (envPlayerId env) frame (envServer env)
```

And in `src/Server/State.hs`, broadcast currently means "send to everyone else online":

```haskell
broadcastToOthers selfPid frame ref = do
  ss <- readMVar ref
  mapM_ (\op -> opSend op frame)
    $ filter (\op -> opPlayerId op /= selfPid) (getOnlinePlayers ss)
```

This is the key scaling issue. As online count grows, fanout cost grows. If many players are moving at once, this becomes expensive quickly. We are also using one shared MVar for world state, which can become a lock-contention hotspot.

Another subtle pressure point appears during login/enter flow - we read map and pub assets on demand from disk:

```haskell
mapAsset <- WFiles.loadMapAsset (charMapId c)
eifAsset <- WFiles.loadPubAsset WFiles.PubEif
enfAsset <- WFiles.loadPubAsset WFiles.PubEnf
esfAsset <- WFiles.loadPubAsset WFiles.PubEsf
ecfAsset <- WFiles.loadPubAsset WFiles.PubEcf
```

That works, but disk I/O in hot paths can amplify latency under concurrency unless cached. Even admission settings show this server is tuned for simplicity, not high-scale production yet:

```haskell
setSocketOption sock ReuseAddr 1
bind sock (addrAddress a)
listen sock 16
```

So where does sharding come in?

In this context, sharding means partitioning live game simulation across multiple server processes, with each process responsible for a subset of world state (for example, a map range or zone set). Instead of one process owning all players and all maps, ownership is split to reduce contention and fanout pressure.

For Endless Online, a practical first step is map- or zone-based partitioning. That aligns naturally with movement boundaries and lets us keep implementation incremental: first reduce global broadcasts with interest management, then introduce shard ownership and handoff paths.

This does not automatically imply separate isolated realms. A single shared-world experience can still be preserved by keeping account identity, chat, and social systems logically global while simulation is partitioned underneath.

## References

- Martin Kleppmann, *Designing Data-Intensive Applications*
  <https://dataintensive.net/>

- Microsoft Azure Architecture Center, "Sharding pattern"
  <https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding>

- Gabriel Gambetta, "Fast-Paced Multiplayer (Networking)"
  <https://www.gabrielgambetta.com/client-server-game-architecture.html>

- Gaffer On Games, "What Every Programmer Needs To Know About Game Networking"
  <https://gafferongames.com/post/what_every_programmer_needs_to_know_about_game_networking/>

- Corbett et al., "Spanner: Google's Globally-Distributed Database" (OSDI 2012)
  <https://www.usenix.org/conference/osdi12/technical-sessions/presentation/corbett>
