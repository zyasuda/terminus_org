# VIDEO_PROMPTS.md

> Version 0.2 — based on STORYBOARD.md v0.2 (internal brainstorm video, 8 scenes)
> Reflects decisions D-004 / D-009 / D-010 / D-012 (two friends + two AI companions, QR join, dice choice).
>
> Ready-to-paste prompts for video generation services (Sora 2 / Veo 3 / Flow).
> Each prompt is self-contained — the service has no memory of prior scenes.
>
> How to use:
> 1. Generate VIDEO scenes: 01, 02, 04, 05, 06, 08 (six clips)
>    — Scene 06 (battle) is the highest-priority clip; start there
> 2. Scenes 03 and 07 are STATIC SLIDES (image prompts included at the bottom) — do not generate video for them
> 3. Save chosen clips as `videos/clips/scene01.mp4` etc.
> 4. Ignore generated audio (voice, SFX and music are layered on later)
> 5. Aspect ratio: 16:9
>
> IMPORTANT: paste these prompts exactly as written. If your first clip does not show
> "two Japanese teenagers at a table with a paper RPG map", stop and check before generating more.

---

## Shared setting (embedded in every prompt; keep this world if you edit)

- Location: a casual Japanese room (living room / bedroom), low wooden table, warm natural light
- Cast: two friends — a Japanese teenage boy and a Japanese teenage girl (late teens)
- Props: hand-drawn paper tavern/dungeon map, four miniature figures (warrior, mage, rogue, cleric), polyhedral dice, two smartphones
- Tone: cinematic, photorealistic, warm color grading, shallow depth of field

---

## Scene 01 — "Two isn't enough" (8 sec)

```
Photorealistic cinematic footage. A weekend afternoon in a casual Japanese room. On a low wooden table: a hand-drawn paper tabletop RPG map, four miniature figures, polyhedral dice, and a stack of thick rulebooks in the foreground. Two friends — a Japanese teenage boy and a Japanese teenage girl — sit at the table and exchange awkward glances, clearly wanting to play but stuck; an uncomfortable pause. The boy shrugs. Warm natural light, slightly muted mood, shallow depth of field, film grain. 16:9.
```

---

## Scene 02 — "The AI brings the party" (10 sec)

```
Photorealistic cinematic footage. A casual Japanese room, low wooden table with a hand-drawn paper tabletop RPG map, miniature figures and polyhedral dice. A Japanese teenage boy places a smartphone at the center of the table; its screen shows a QR code. A Japanese teenage girl holds her own smartphone over it to scan, and both phones light up softly, casting a warm glow across the paper map. The two friends lean in, faces brightening with surprise and excitement. Warm evening light, cinematic, shallow depth of field. 16:9.
```

---

## Scene 04 — "How a turn works" (14 sec)

```
Photorealistic cinematic footage. A casual Japanese room, low wooden table with a hand-drawn paper tabletop RPG map. A Japanese teenage boy moves a miniature figure to a drawn door on the map and speaks toward the smartphone at the center of the table. He then rolls physical polyhedral dice; close-up of the dice tumbling and settling. The phone screen glows in response, as if reacting to the result, and both he and a Japanese teenage girl lean in with anticipation, then react with delight. Warm evening light, cinematic, shallow depth of field, film grain. 16:9.
```

---

## Scene 05 — "AI companions" (10 sec)

```
Photorealistic cinematic footage. A casual Japanese room, low wooden table. On a hand-drawn paper tabletop RPG map stand four miniature figures — two placed near a Japanese teenage boy and a Japanese teenage girl, two standing slightly apart as their AI party members. A glowing smartphone at the center of the table seems to be speaking; the two friends listen and suddenly burst out laughing at the banter. The girl picks up one of the AI companions' figures and moves it forward on the map for it. Warm evening light, cinematic, shallow depth of field. 16:9.
```

---

## Scene 06 — "Battle!" (12 sec) ★generate this first

```
Photorealistic cinematic footage. A battle moment in a tabletop RPG session in a casual Japanese room at dusk. On the low wooden table, a smartphone at the center of a hand-drawn paper map glows red-orange, its light tinting the room; a simple HP bar and an enemy silhouette are visible on its screen. A Japanese teenage boy throws physical polyhedral dice in slow motion and shouts the result joyfully; a Japanese teenage girl taps her own smartphone, where digital dice bounce on screen. Miniature figures face off on the map. Their faces are tense, then break into cheers. Dramatic warm backlight, cinematic, film grain. 16:9.
```

---

## Scene 08 — "Closing" (6 sec)

```
Photorealistic cinematic footage. A wide shot of a casual Japanese room at dusk. Two friends — a Japanese teenage boy and a Japanese teenage girl — sit at a low wooden table laughing together. On the table, four miniature figures stand together on a hand-drawn paper tabletop RPG map, lit warmly by a smartphone's soft glow; the rest of the room falls into gentle shadow. The camera slowly pulls back. Quiet, warm, lingering final shot with empty space at the center of the frame for a logo overlay. Cinematic, warm color grading. 16:9.
```

(Logo and tagline "今日は、全員が冒険者。" are added in post-production.)

---

## Static slides (Scenes 03 and 07 — image generation, NOT video)

### Scene 03 — System overview (base image for label overlays)

```
Photorealistic top-down overhead shot of a low wooden table in a Japanese room: a hand-drawn paper tabletop RPG map at the center with four miniature figures on it, polyhedral dice scattered nearby, two smartphones placed at the table's edge with softly glowing screens. Clean composition with generous space around each object group for diagram labels to be added later. Warm natural light, sharp focus throughout. 16:9.
```

Labels to overlay afterwards (I can composite these):
1. Paper map / figures / dice → "物理。手で触る楽しさはそのまま"
2. Smartphones → "AI = GM・NPC・AI冒険者。会話と演出を担当"
3. Gear icon → "ゲームエンジン = ルール・HP・判定を管理"

### Scene 07 — Three novelty cards (background image)

```
A softly blurred, warm-toned photograph of a tabletop RPG scene on a wooden table — paper map, miniature figures, dice, gentle smartphone glow — heavily out of focus, usable as a calm background for large text cards. Warm amber tones, no sharp subject, 16:9.
```

Cards to overlay afterwards:
1. 「GM不足を解決 —— AIが常にGM」
2. 「紙 × AI —— アナログの楽しさはそのまま」
3. 「初心者OK —— ルールはAIとエンジンが面倒を見る」

---

## Audio assets (produce after footage is ready)

- AI GM / Gareth / Lily voices: voice synthesis (e.g. ElevenLabs). Line list: STORYBOARD.md Voice sections
- Player lines (「GM、どっちがやる？」「よし、17！」etc.): record friends reading them on a phone — natural and free
- Music: one track via Suno or similar — "quiet acoustic guitar opening, tense percussive battle section in the middle, warm quiet resolution, about 80 seconds, no vocals"
- Battle jingle and SFX (dice, door creak, sword clashes): free SFX libraries are sufficient at this quality level
