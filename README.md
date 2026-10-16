# Crownfall: The Cursed Keep

Crownfall is a cross-device cooperative deck RPG for 2–6 players. The crew fights through six rooms of a necrotic keep and defeats the Giant Skeleton King in the Bone Throne.

Play online: [Crownfall — The Cursed Keep](https://crownfall-castle-heist.onrender.com/).

## Run locally

Requires Node.js 20 or newer. The app uses only Node's built-in modules.

```sh
npm start
```

Open `http://localhost:8787` in a browser. For separate devices on the same network, open the host computer's local network address on each device. To play over the internet, deploy the web service with `render.yaml` or another Node host that supports WebSockets.

## Multiplayer rules

- Create a room and share its five-character invite code or copied invite link. The host starts when at least two players have joined. Up to six players can join; six distinct classes are randomly dealt when the run starts.
- The keep is six tile-grid rooms: the Cursed Gatehouse, Rotting Stables, Moonless Gallery, Crypt Barracks, Desecrated Chapel, and Bone Throne. The crew wins by defeating every enemy in Room 6, including the Giant Skeleton King.
- Each hero has a 40-card deck. At the beginning of a turn, draw up to three cards. You may use two card plays; playing or discarding a card spends one play. Cards left unplayed stay in hand. When the draw pile empties, the discard pile is shuffled back in.
- Discard any card to move by its dot value: basic cards move one tile and class cards move two. Diagonal distance counts as one tile. Guard absorbs damage before HP.
- Every enemy type has its own 15-card deck and plays a card when the crew ends the round. Rooms 3 and 6 have a random static effect with both a benefit and drawback.
- After each room, each living hero chooses one of three passive abilities. The party drafts `ceil(living players / 2)` items in rotating order. Consumables are used from Pockets; permanent gear remains with its carrier.
- The live Room Chat tab lets players coordinate from separate devices. The quick-start guide explains the basics when a run begins; there is no separate tutorial level.

See [the card and enemy reference](docs/cursed-keep-reference.md) for complete deck lists, hover text, and enemy details.

## Deployment

`render.yaml` describes a Node web service with WebSocket support. Connect the Git repository in Render to host the game at a public `onrender.com` URL. Room sessions live in server memory, so restarting or redeploying the service ends active runs.

The project has no external runtime packages. `server.js` serves the browser app and handles WebSockets, `server/engine.js` contains the multiplayer rules, and `public/game-data.js` contains the classes, cards, abilities, enemies, and items.

