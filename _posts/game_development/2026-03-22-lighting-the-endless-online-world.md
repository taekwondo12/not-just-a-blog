---
layout: post
title: "Lighting The Endless Online World (Part 1): From Zero To Atmosphere"
date: 2026-03-22
category: game_development
---

I remember walking across Aeven when I was about twelve and thinking it would be cool to see it properly at night.

Not pitch black, not in some modern rendering sense. I just wanted lamplight. A little warmth on the ground. I mostly just wanted to see what happened to the mood once that was there.

EO always had atmosphere in its art even when the engine was doing almost nothing with light, so I wanted to see what happened if that changed.

By the early 2010s, official development had largely gone quiet. The old history page trails off in 2011, and the current official dev-post archive starts up again in July 2023. In the years between, the community kept things alive through server emulation, protocol digging, replacement clients, and custom tooling. Projects like `eo-web` from [Sorokya](https://github.com/sorokya), `EndlessClient` from [EthanMoffat](https://github.com/ethanmoffat), and `eomap-js` from [@cirras](https://github.com/cirras) were already out there, so it felt like a good time to try.

The code for this part sits here in `eomap-js`: [lighting commit](https://github.com/taekwondo12/eomap-js/commit/484be860a5c777190cf44083f691df5cceb9027a).

A shout-out to `@Stephen` and `@JC`, who shared references and helped shape how this ought to look.

## Building on `eomap-js`

[cirras/eomap-js](https://github.com/cirras/eomap-js) gave me a solid place to start. I did not come in with a perfect mental model of where lighting should live. I looked at how the existing layers are added, selected, and drawn, then followed that path until I had a map in my head.

What helped is that it already cared about emulating EO map behavior properly rather than being a generic editor. I was trying to add atmosphere in a way that felt native to the rest of the tooling.

I also did not know exactly what the light should look like at first. After looking at references, it became clear the right starting point was a ground radial at the lamp base, a raised source glow above it, and shadow direction from the object base rather than some screen-space guess.

![Ground radial example]({{ '/images/radial_example.png' | relative_url }})

## The math

The core is tile/world conversion. For a light on tile `(x, y)`:

```js
worldX = x * 32 - y * 32 + 32
worldY = x * 16 + y * 16 + 16
```

And for picking, exclusions, and caster checks:

```js
tileX = floor(worldY / 32 + (worldX + 32) / 64) - 1
tileY = -floor((worldX + 32) / 64 - worldY / 32)
```

Light radius is stored in tiles and drawn in pixels:

```js
radiusPx = radiusTiles * 32
```

Height projected into screen space:

```js
screenZ = abs(z) * 0.5
```

Ground footprint from radius and height:

```js
groundRadius = max(r * 0.15, sqrt(max(0, r*r - screenZ*screenZ)))
```

That floor keeps the ground radial visible even when `z` is high. The raised source uses:

```js
sourceY = groundY - z * 0.5
```

That keeps the glow on the ground tied to the glow above it.

## Putting it together

Once that math was in place, the rest was straightforward. The scene gets a warm amber tint, each lamp cuts out its ground radial, and the raised glow is drawn above it. There is also a basic occlusion step: nearby walls and objects cast simple ground shadows. While placing, a preview gizmo stays visible. Once placed, the light becomes part of the map.

However, after a bit of feedback, it was obvious the shadows were off. I was casting from where the glow is drawn on screen, which made them drift. `@apollo` corrected me on that. The fix was to cast from the lamp base tile `(x, y)` and only use `z` for where the light appears visually. I also exclude the lamp's own tile, because otherwise it ends up casting a shadow on itself, which looked very weird.

<div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-start;">
  <div style="flex: 1 1 320px;">
    <img
      src="{{ '/images/shadow_example.png' | relative_url }}"
      alt="Shadow example before correction"
      style="display: block; width: 100%; height: auto;"
    >
  </div>
  <div style="flex: 1 1 320px;">
    <img
      src="{{ '/images/shadow_correction.png' | relative_url }}"
      alt="Shadow example after correction"
      style="display: block; width: 100%; height: auto;"
    >
  </div>
</div>

For quick iteration, keyboard controls are built into placement: `Ctrl/Cmd + [ ]` changes radius, `Ctrl/Cmd + - +` changes intensity, and `Ctrl/Cmd + .` (or `PageUp/PageDown`) moves `z`.

## Later on

Most of this work is already done. I just split the writing into two parts because covering everything at once would make the post too broad. The next one can focus on stronger wall and object occlusion, richer presets, and better long-caster behavior.

That was the point. Not to turn EO into a different game, just to see what it looks like when you give its nights a bit more warmth.

## Result

![Part 1 lighting result]({{ '/images/lighting-part1-result.gif' | relative_url }})
