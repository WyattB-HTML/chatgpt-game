# Crownfall: A Castle Heist

Crownfall is a real-time, cross-device co-op deck RPG. A crew of 2–6 players fights through 12 rooms on a tile grid, chooses an ability and shared loot after each room, defeats the King and vault guardian, then escapes through the gate with the relic.

## Run locally

Requires Node.js 20 or newer. The app uses only Node's built-in modules.

```sh
npm start
```

Open `http://localhost:8787` in a browser. For separate devices on the same network, open the host computer's local network address on each device. To play over the internet, deploy the web service with `render.yaml` or another Node host that supports WebSockets.

## Multiplayer

Create a room and share the five-character invite code or the copied invite link. Each device joins with its own name and class. The host begins the run once at least two players have joined. A room accepts up to six players. The game state is authoritative on the server and broadcast to everyone in the room. Room sessions are held in server memory, so restarting or redeploying the service ends active runs.

## Rules

- **The keep:** 12 rooms across two floors. Floor one has guards, soldiers, archers, horses, and guard dogs; the King waits in Room 6. Floor two has monsters, skeletons, zombies, and beasts; Room 12 has a randomly chosen Basilisk, Cockatrice, or Gryphon.
- **Combat:** The tile board is 9×9. Count range with horizontal and vertical steps. Walls block movement unless a card says jump or teleport. Heroes have different maximum HP. Guard absorbs damage before HP; a hero at 0 HP is fallen.
- **A player's turn:** Draw up to 3 cards, then play up to 2. Choose a card and click a tile or target to resolve it. Used cards go to the discard pile; cards left in hand stay there. Shuffle the discard pile when the draw pile runs out. Each deck has 40 cards: five each of Step, Stride, Basic Strike, and Block, plus class cards. Every class deck has five specialized reaction cards that can trigger outside their owner's turn.
- **The crew's round:** Players can take their turns in any order. When every living hero ends their turn, enemies move and attack. Repeat until every enemy is defeated.
- **Rewards:** After every room, each living hero gains a level and chooses one of three passive abilities. The crew shares one item per two living heroes, rounded up; a hero may claim at most one item from that room. Permanent gear stays with its carrier; consumables are used from the Pockets panel.
- **Evolution:** After Room 6, each living hero chooses one of two subclasses. The class-specific cards in that hero's deck upgrade toward the chosen focus. Room 6 also offers a normal room reward.
- **Room effects:** Rooms 3, 6, 9, and 12 each roll a random effect that gives the crew a benefit and a drawback. Read its banner before acting.
- **The Rogue (optional):** A crew of 3–6 may enable Rogue mode. If randomly assigned or chosen, the Rogue imitates a class no one else in the crew uses, including its deck and abilities. The Rogue can flip unique class cards into Rogue tricks, harm party members, and attempt to steal the artifact beside the living Room 12 guardian. A successful Rogue must escape alone with the relic to win. Otherwise, the crew wins by reaching the gate.
- **The escape:** After Room 12, move one tile per action to the marked gate. A hero who reaches it can claim the crew's escape. A Rogue who stole the relic must reach it alone.

## Deployment

The `render.yaml` Blueprint describes one Node web service in Render's Ohio region. The service needs a Git repository that Render can read; once this workspace is pushed to a repository, create the service from the Blueprint or connect that repository in Render. Render supplies the public `onrender.com` URL. WebSocket upgrades are used to keep players' rooms synchronized.

The project deliberately has no external runtime packages. `server.js` serves the browser app and handles the WebSocket connection; `server/engine.js` holds the multiplayer rules; `public/game-data.js` is the shared class, card, ability, enemy, and item catalog.

