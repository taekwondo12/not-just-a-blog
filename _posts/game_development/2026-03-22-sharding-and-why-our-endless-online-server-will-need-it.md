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

Sharding means splitting one world's workload across multiple server processes, each responsible for a subset of simulation. For an MMO-style map server, a natural first shard key is map or zone. Instead of one process owning every player and every map, shard A can own maps 1–50, shard B maps 51–100, and so on.

The important point: sharding does not have to mean separate isolated realms. You can still provide a shared-world experience by keeping identity, chat, party, and social systems global while distributing map simulation. Our current codebase is exactly what a good prototype should be - clear and honest about what it is.
