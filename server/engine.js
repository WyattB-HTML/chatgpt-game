const crypto = require('node:crypto');
const D = require('../public/game-data.js');

const SIZE = 9;
const MAX_PLAYERS = 6;
const safeName = (name) => String(name || '').trim().slice(0, 18) || 'Adventurer';
const id = (prefix = '') => `${prefix}${crypto.randomBytes(5).toString('hex')}`;
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const living = (p) => p && !p.dead;
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function makeMap() {
  const walls = new Set(['3,1', '3,2', '5,6', '5,7', '1,5', '2,5', '7,3']);
  return { size: SIZE, walls: [...walls] };
}

function baseDeck(className, characterId) {
  const cards = [];
  const basics = [
    { id: 'step-one', name: 'Step', category: 'movement', text: 'Move 1 tile.', effect: { move: 1 }, copies: 5 },
    { id: 'step-two', name: 'Stride', category: 'movement', text: 'Move up to 2 tiles.', effect: { move: 2 }, copies: 5 },
    { id: 'basic-strike', name: 'Basic Strike', category: 'attack', text: 'Deal 1 damage. Range 1.', effect: { damage: 1, range: 1 }, copies: 5 },
    { id: 'block', name: 'Block', category: 'defense', text: 'Gain 1 guard.', effect: { shield: 1 }, copies: 5 }
  ];
  for (const template of basics) for (let n = 0; n < template.copies; n++) cards.push(makeCard(template, false, characterId));
  for (const template of D.DECKS[className] || D.DECKS.Wizard) {
    for (let n = 0; n < template.copies; n++) cards.push(makeCard(template, true, characterId));
  }
  return shuffle(cards);
}

function makeCard(template, unique, owner) {
  return {
    uid: id('c'), id: template.id, name: template.name, category: template.category,
    text: template.text, effect: { ...(template.effect || {}) }, response: template.response || null,
    outOfTurn: !!template.outOfTurn, unique, owner, upgraded: false
  };
}

function newPlayer({ playerId, name, colorIndex }) {
  const stats = D.CLASSES.Wizard;
  return {
    id: playerId, name: safeName(name), className: null, disguiseClass: null,
    subclass: null, level: 1, hp: stats.hp, maxHp: stats.hp, x: [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]][colorIndex % 6][0], y: [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]][colorIndex % 6][1],
    dead: false, guard: 0, hand: [], draw: [], discard: [], abilities: [],
    items: [], buffs: [], debuffs: [], ended: false, played: 0, playLimit: 2, nextPlayBonus: 0, categoriesPlayed: [],
    focusId: null, roomFlags: {}, runFlags: {}, colorIndex, rogueStolen: false, artifact: false
  };
}

function enemyTemplate(name, floor, boss = false, partySize = 2) {
  const bossStats = {
    King: [21 + partySize * 4, 4, 1], Basilisk: [24 + partySize * 4, 4, 3],
    Cockatrice: [20 + partySize * 4, 3, 3], Gryphon: [23 + partySize * 4, 4, 2]
  };
  const stats = bossStats[name] || ({
    Guard: [4 + floor, 1 + (floor === 2 ? 1 : 0), 1], Soldier: [6 + floor, 2, 1], Archer: [4 + floor, 2, 4],
    Horse: [7 + floor, 3, 1], 'Guard Dog': [3 + floor, 1, 1], Monster: [7 + floor * 2, 3, 1],
    Skeleton: [5 + floor, 2, 3], Zombie: [8 + floor, 2, 1], Beast: [7 + floor, 3, 1]
  }[name] || [5 + floor, 2, 1]);
  const abilities = {
    King: 'Royal cleave: adjacent targets take 4; challengers are weakened.', Basilisk: 'Petrifying stare: ranged attack; hit targets are dazed.',
    Cockatrice: 'Stone-feather volley: shoots the farthest hero and roots them.', Gryphon: 'Raking dive: leaps beside a hero and sweeps nearby tiles.',
    Archer: 'Prefers long range; shoots for 2.', Horse: 'Charges in a straight line and shoves its target.',
    'Guard Dog': 'Fast; bites for 1 and roots the target.', Skeleton: 'Ranged bone shot; deals 2.', Zombie: 'Slow; bites for 2 and weakens.',
    Beast: 'Pounces for 3 and pushes its target.', Monster: 'Heavy blow for 3; splash hits nearby heroes.'
  };
  return { id: id('e'), name, hp: stats[0], maxHp: stats[0], damage: stats[1], range: stats[2], boss, x: 7, y: 7, guard: 0, debuffs: [], ability: abilities[name] || `Attacks for ${stats[1]} damage.` };
}

function createRoom(roomNo, players, previousModifier = null) {
  const floor = roomNo <= 6 ? 1 : 2;
  const map = makeMap();
  const allNames = D.ENEMY_NAMES[roomNo];
  let names;
  let bossName = null;
  if (roomNo === 6) { bossName = 'King'; names = ['King', 'Guard', 'Archer']; }
  else if (roomNo === 12) { bossName = ['Basilisk', 'Cockatrice', 'Gryphon'][Math.floor(Math.random() * 3)]; names = [bossName, 'Skeleton', 'Beast']; }
  else {
    const size = Math.min(5, 2 + Math.floor(players.length / 2) + (roomNo % 2));
    names = Array.from({ length: size }, (_, index) => allNames[(index + roomNo) % allNames.length]);
  }
  const positions = [[7, 7], [7, 1], [4, 7], [6, 4], [2, 7]];
  const enemies = names.map((name, index) => ({ ...enemyTemplate(name, floor, name === bossName, players.length), x: positions[index][0], y: positions[index][1] }));
  const mod = [3, 6, 9, 12].includes(roomNo) ? D.clone(D.MODIFIERS[Math.floor(Math.random() * D.MODIFIERS.length)]) : null;
  for (const p of players) {
    const spawn = [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]][p.colorIndex % 6]; p.x = spawn[0]; p.y = spawn[1];
    p.ended = false; p.played = 0; p.categoriesPlayed = []; p.roomFlags = {}; p.guard = 0;
    if (mod?.rule === 'dim_start') p.roomFlags.dimStart = true;
    p.guard += p.abilities.reduce((sum, a) => sum + (a.effect === 'guard' ? a.value : a.effect === 'startGuard' ? a.value : 0), 0);
    for (const item of p.items) p.guard += item.startGuard || 0;
    p.guard += p.items.reduce((sum, item) => sum + (item.classGuard || 0), 0);
    if (baseClass(p) === 'Barbarian') p.guard += p.abilities.some((a) => a.id === 'unbroken') ? 2 : 0;
    if (baseClass(p) === 'Knight' && p.abilities.some((a) => a.id === 'stand-fast')) p.guard += 2;
    if (p.buffs.some((b) => b.type === 'room_guard')) p.guard += 1;
    startTurn(p, mod);
    if (enemies.some((enemy) => enemy.boss) && abilityValue(p, 'bossDraw')) { drawCards(p, abilityValue(p, 'bossDraw')); p.runFlags.bossSeen = true; }
  }
  return { room: roomNo, floor, map, enemies, modifier: mod, round: 1, artifact: roomNo === 12 ? 'sealed' : null, exit: { x: 0, y: 4 }, bossName, turnLog: [`Room ${roomNo}: ${roomLabel(roomNo)}.`, ...(mod ? [`Static effect: ${mod.name}.`] : [])] };
}

function roomLabel(roomNo) {
  const names = ['Gatehouse', 'Stable Court', 'Moon Gallery', 'Barracks', 'Old Chapel', 'Throne Hall', 'Crypt Stair', 'Bone Gallery', 'Flooded Cellar', 'Beast Pens', 'Hall of Echoes', 'Basilisk Vault'];
  return names[roomNo - 1] || `Room ${roomNo}`;
}

function startTurn(player, modifier = null) {
  if (!living(player)) return;
  player.ended = false; player.played = 0; player.categoriesPlayed = [];
  player.playLimit = 2 + Number(player.nextPlayBonus || 0); player.nextPlayBonus = 0;
  player.attacksThisTurn = 0;
  player.handSize = 3 + abilityValue(player, 'hand')
    + player.items.reduce((sum, item) => sum + (item.hand || 0), 0)
    + (modifier?.hero?.hand || 0);
  if (player.roomFlags?.dimStart) { player.handSize = Math.max(1, player.handSize - 1); player.roomFlags.dimStart = false; }
  player.handSize = Math.max(1, player.handSize);
  const missing = Math.max(0, player.handSize - player.hand.length);
  for (let i = 0; i < missing; i++) {
    if (!player.draw.length && player.discard.length) { player.draw = shuffle(player.discard); player.discard = []; }
    const card = player.draw.pop(); if (card) player.hand.push(card);
  }
  for (const a of player.abilities) if (a.effect === 'turnStartHeal') player.hp = Math.min(player.maxHp, player.hp + a.value);
}

function createLobby({ hostId, name }) {
  const code = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
  const player = newPlayer({ playerId: hostId, name, colorIndex: 0 });
  return {
    code, hostId, createdAt: Date.now(), phase: 'lobby', players: [player], rogueEnabled: false,
    roomState: null, reward: null, winner: null, lastAction: null
  };
}

function dealClasses(game, rogueEnabled) {
  const wantsRogue = !!rogueEnabled && game.players.length >= 3;
  const pool = shuffle([...D.CLASS_ORDER, ...(wantsRogue ? ['Rogue'] : [])]);
  const assignments = pool.slice(0, game.players.length);
  const usedCore = new Set(assignments.filter((name) => name !== 'Rogue'));
  const disguises = shuffle(D.CLASS_ORDER.filter((name) => !usedCore.has(name)));
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    const assigned = assignments[i];
    const disguiseClass = assigned === 'Rogue' ? disguises.pop() : null;
    const actualClass = disguiseClass || assigned;
    const stats = D.CLASSES[actualClass] || D.CLASSES.Wizard;
    player.className = assigned;
    player.disguiseClass = disguiseClass;
    player.hp = stats.hp; player.maxHp = stats.hp;
    player.draw = baseDeck(actualClass, player.id);
    player.hand = []; player.discard = [];
  }
  game.rogueEnabled = wantsRogue;
}

function publicState(game, viewerId = null) {
  const state = JSON.parse(JSON.stringify(game));
  for (const player of state.players) {
    if (player.className === 'Rogue' && player.id !== viewerId) {
      player.className = player.disguiseClass || 'Wizard';
      player.disguiseClass = null;
      player.subclass = null;
      player.abilities = [];
      player.rogueStolen = false;
    }
    if (player.id !== viewerId) {
      player.handCount = player.hand.length;
      player.drawCount = player.draw.length;
      player.discardCount = player.discard.length;
      player.hand = []; player.draw = []; player.discard = [];
    }
  }
  if (state.reward?.choices) {
    for (const [playerId, choice] of Object.entries(state.reward.choices)) {
      if (playerId !== viewerId) { delete choice.abilityOptions; delete choice.subclassOptions; }
    }
  }
  if (state.roomState?.reactionPrompt && state.roomState.reactionPrompt.playerId !== viewerId) delete state.roomState.reactionPrompt.cardIds;
  return state;
}

function connectedCount(game, peers) { return game.players.filter((p) => peers.has(p.id)).length; }
function alivePlayers(game) { return game.players.filter(living); }
function eligiblePlayers(game) { return game.players.filter(living); }
function actor(game, playerId) { return game.players.find((p) => p.id === playerId); }

function addLog(game, message) {
  game.roomState.turnLog.push(message);
  game.roomState.turnLog = game.roomState.turnLog.slice(-35);
}

function distances(state, target, enemy = false) {
  const targetPosition = enemy ? target : target;
  return targetPosition;
}

function abilityValue(player, effect) {
  return player.abilities.reduce((sum, a) => sum + (a.effect === effect ? Number(a.value || 1) : 0), 0);
}

function itemValue(player, key) { return player.items.reduce((sum, item) => sum + Number(item[key] || 0), 0); }
function isRogue(player) { return player.className === 'Rogue'; }
function baseClass(player) { return player.disguiseClass || player.className; }

function movePlayer(game, player, x, y, card = null) {
  if (game.phase === 'battle' && player.debuffs.some((d) => d.type === 'root') && !abilityValue(player, 'cleanse')) return 'You are rooted and cannot move this round.';
  const room = game.roomState;
  const distTiles = dist(player, { x, y });
  const freeMove = player.buffs.find((buff) => buff.type === 'freeMove');
  let max = Number(card?.effect?.move || 0) + abilityValue(player, 'move') + itemValue(player, 'move') + (freeMove?.value || 0);
  if (baseClass(player) === 'Ranger' && player.played === 0) max += 1;
  if (game.roomState.modifier?.rule === 'rough_move' && card?.category === 'movement') max = Math.max(1, max - 1);
  if (card?.effect?.move && card.effect.target === 'ally') max = Number(card.effect.move) + 1;
  const teleport = !!card?.effect?.teleport || !!card?.effect?.jump || (card?.id === 'rogue-shadowstep');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= SIZE || y < 0 || y >= SIZE || distTiles > max || distTiles === 0) return 'That tile is outside this movement card’s reach.';
  if (room.map.walls.includes(`${x},${y}`)) return 'That tile is blocked by rubble.';
  if (room.enemies.some((e) => e.hp > 0 && e.x === x && e.y === y) || game.players.some((p) => p.id !== player.id && living(p) && p.x === x && p.y === y)) return 'Someone is standing there.';
  const occupied = [...room.enemies.filter((e) => e.hp > 0), ...game.players.filter((p) => p.id !== player.id && living(p))].map((actor) => `${actor.x},${actor.y}`);
  if (!teleport && !pathOpen(room, { x: player.x, y: player.y }, { x, y }, max, occupied)) return 'A wall or another fighter blocks that path.';
  player.x = x; player.y = y;
  if (freeMove) player.buffs.splice(player.buffs.indexOf(freeMove), 1);
  player.roomFlags.movedThisRound = true;
  return null;
}

function pathOpen(room, from, to, maxSteps, occupied = []) {
  const walls = new Set(room.map.walls);
  const blockers = new Set(occupied);
  const q = [{ x: from.x, y: from.y, n: 0 }]; const seen = new Set([`${from.x},${from.y}`]);
  while (q.length) {
    const cur = q.shift(); if (cur.x === to.x && cur.y === to.y) return true;
    if (cur.n >= maxSteps) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = cur.x + dx, y = cur.y + dy, key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || walls.has(key) || blockers.has(key) || seen.has(key)) continue;
      seen.add(key); q.push({ x, y, n: cur.n + 1 });
    }
  }
  return false;
}

function chargeTile(game, player, target, range, baseMove) {
  const room = game.roomState;
  const blockers = [...room.enemies.filter((enemy) => enemy.hp > 0), ...game.players.filter((hero) => hero !== player && living(hero))].map((actor) => `${actor.x},${actor.y}`);
  const freeMove = player.buffs.find((buff) => buff.type === 'freeMove');
  let steps = Number(baseMove || 0) + abilityValue(player, 'move') + itemValue(player, 'move') + (freeMove?.value || 0);
  if (baseClass(player) === 'Ranger' && player.played === 0) steps++;
  const candidates = [];
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) {
    const tile = { x, y }, distance = dist(player, tile);
    if (!distance || distance > steps || dist(tile, target) > range || room.map.walls.includes(`${x},${y}`) || blockers.includes(`${x},${y}`)) continue;
    if (pathOpen(room, player, tile, steps, blockers)) candidates.push(tile);
  }
  candidates.sort((a, b) => dist(a, target) - dist(b, target) || dist(player, a) - dist(player, b));
  return candidates[0] || null;
}

function findCard(player, cardUid) { return player.hand.find((card) => card.uid === cardUid); }

function rogueVersion(card) {
  const variants = {
    attack: { id: 'rogue-backstab', name: 'Backstab', text: 'Deal 2 damage. Rogues may target a player.', effect: { damage: 2, range: 1, target: 'any' } },
    defense: { id: 'rogue-fade', name: 'Fade Away', text: 'Gain 2 guard and become hard to target.', effect: { shield: 2, buff: 'evasion' } },
    movement: { id: 'rogue-shadowstep', name: 'Shadowstep', text: 'Dash 2 tiles through walls.', effect: { move: 2, teleport: true } },
    skill: { id: 'rogue-lift-purse', name: 'Lift Purse', text: 'Steal a consumable from an adjacent player or draw a card.', effect: { stealItem: true, range: 1, draw: 1, target: 'any' } }
  };
  return variants[card.category] || variants.skill;
}

function effectiveCard(player, card, flipped) {
  if (flipped && isRogue(player) && card.unique) {
    const variant = rogueVersion(card);
    const effect = { ...variant.effect };
    if (card.upgraded) {
      const preferred = card.upgradeFocus === 'damage' ? ['damage', 'shield', 'range'] : ['heal', 'shield', 'move', 'draw', 'range'];
      const key = preferred.find((name) => Number(effect[name]) > 0);
      if (key) effect[key]++;
    }
    return { ...card, ...variant, effect, flipped: true };
  }
  return { ...card, effect: { ...card.effect } };
}

function targetByAction(game, action, allowed = 'enemy') {
  if (allowed === 'enemy') return game.roomState.enemies.find((e) => e.id === action.targetId && e.hp > 0);
  if (allowed === 'player') return game.players.find((p) => p.id === action.targetId && living(p));
  return null;
}

function cardCategoryBlocked(game, player, card) {
  const rule = game.roomState.modifier?.rule;
  if (rule === 'one_category' && player.categoriesPlayed.includes(card.category)) return true;
  if (rule === 'limit_attack' && card.category === 'attack' && player.categoriesPlayed.includes('attack')) return true;
  return false;
}

function useCard(game, player, action) {
  if (player.ended) return 'Your turn is already ended.';
  const original = findCard(player, action.cardId);
  if (!original) return 'That card is no longer in your hand.';
  if (original.outOfTurn) return 'Reaction cards can only be used when their trigger appears. Discard it instead if you do not want to hold it.';
  const card = effectiveCard(player, original, !!action.flipped);
  if (cardCategoryBlocked(game, player, card)) return `The room effect blocks a second ${card.category} card this turn.`;
  const freeAttack = card.category === 'attack' && abilityValue(player, 'freeAttack') && !player.roomFlags.freeAttackSpent;
  const freeSkill = card.category === 'skill' && abilityValue(player, 'freeSkill') && !player.roomFlags.freeSkillSpent;
  const playLimit = Number(player.playLimit || 2);
  if (player.played >= playLimit && !freeAttack && !freeSkill) return `You have used all ${playLimit} card plays this turn.`;
  const effect = card.effect || {};
  if (card.category === 'movement') {
    let movedActor = player;
    if (effect.target === 'ally') {
      const ally = targetByAction(game, action, 'player'); if (!ally || dist(player, ally) > (effect.range || 3)) return 'Choose an ally in range.';
      const err = movePlayer(game, ally, action.x, action.y, card); if (err) return err;
      movedActor = ally;
    } else {
      const err = movePlayer(game, player, action.x, action.y, card); if (err) return err;
    }
    if (effect.shield) movedActor.guard += effect.shield + abilityValue(player, 'shield');
  } else if (effect.damage || card.category === 'attack') {
    let target;
    const wantsPlayer = effect.target === 'any' && action.targetKind === 'player';
    if (wantsPlayer) {
      if (!isRogue(player)) return 'Only the Rogue may target an ally.';
      target = targetByAction(game, action, 'player');
    } else target = targetByAction(game, action, 'enemy');
    if (!target) return 'Choose a living target.';
    const range = (effect.range || 1) + abilityValue(player, 'range') + itemValue(player, 'range') + (baseClass(player) === 'Ranger' ? 1 : 0) + (game.roomState.modifier?.hero?.range || 0);
    const hasAbility = (abilityId) => player.abilities.some((ability) => ability.id === abilityId);
    const abilityPoints = (abilityId) => Number(player.abilities.find((ability) => ability.id === abilityId)?.value || 0);
    const lastWord = target.boss && hasAbility('last-word') && !player.roomFlags.lastWord;
    if (dist(player, target) > range && effect.charge && !lastWord) {
      const destination = chargeTile(game, player, target, range, effect.move);
      if (!destination) return 'That target is too far away, or no clear charge path is open.';
      const moveError = movePlayer(game, player, destination.x, destination.y, { category: card.category, effect: { move: effect.move } });
      if (moveError) return moveError;
    }
    if (dist(player, target) > range && !lastWord) return 'That target is out of range.';
    if (lastWord) player.roomFlags.lastWord = true;
    let damage = Number(effect.damage || 0);
    damage += itemValue(player, 'damage') + (player.focusId === target.id ? itemValue(player, 'focusDamage') : 0);
    damage += game.roomState.modifier?.hero?.damage || 0;
    const nextAttack = card.category === 'attack' ? player.buffs.find((buff) => buff.type === 'nextAttack') : null;
    if (nextAttack) damage += nextAttack.value;
    if (baseClass(player) === 'Ranger' && range > 1) damage += abilityValue(player, 'rangedDamage');
    if (player.focusId === target.id) damage += abilityValue(player, 'focus');
    if (baseClass(player) === 'Swordsman' && player.focusId === target.id && player.played > 0) damage += 2;
    if (!player.roomFlags.openingStrike) {
      if (hasAbility('careful-casting')) damage += abilityPoints('careful-casting');
      if (hasAbility('opening-gambit')) damage += abilityPoints('opening-gambit');
      if (hasAbility('careful-casting') || hasAbility('opening-gambit')) player.roomFlags.openingStrike = true;
    }
    if (hasAbility('clean-shot') && !game.roomState.enemies.some((e) => e.hp > 0 && dist(player, e) <= 1)) damage += abilityPoints('clean-shot');
    if (hasAbility('roving-aim') && player.roomFlags.movedThisRound) damage += abilityPoints('roving-aim');
    if (hasAbility('still-aim') && !player.roomFlags.movedThisRound) damage += abilityPoints('still-aim');
    const isolatedTarget = !game.roomState.enemies.some((enemy) => enemy.id !== target.id && enemy.hp > 0 && dist(enemy, target) <= 1);
    if (isolatedTarget) damage += abilityPoints('isolate') + abilityPoints('lethal-opening');
    if (hasAbility('executioner') && target.hp <= target.maxHp / 4) damage += abilityPoints('executioner');
    if (hasAbility('first-blood') && target.hp === target.maxHp) damage += abilityPoints('first-blood');
    if (hasAbility('last-cut') && player.hp <= player.maxHp / 2) damage += abilityPoints('last-cut');
    if (hasAbility('last-arrow') && player.hp <= 1) damage += abilityPoints('last-arrow');
    if (hasAbility('apocalypse-ready') && player.hp === player.maxHp && !player.roomFlags.apocalypseReady) { damage += abilityPoints('apocalypse-ready'); player.roomFlags.apocalypseReady = true; }
    if (hasAbility('double-tap') && range > 1 && !player.roomFlags.doubleTap) { damage += abilityPoints('double-tap'); player.roomFlags.doubleTap = true; }
    if (hasAbility('last-one-standing') && !eligiblePlayers(game).some((ally) => ally.id !== player.id && dist(ally, player) <= 1)) damage += abilityPoints('last-one-standing');
    const banner = eligiblePlayers(game).find((ally) => ally.id !== player.id && baseClass(ally) === 'Knight' && dist(ally, player) <= 1 && abilityValue(ally, 'adjacentBuff'));
    if (banner) damage += abilityValue(banner, 'adjacentBuff');
    if (['Barbarian', 'Swordsman'].includes(baseClass(player)) && range <= 1) damage += abilityValue(player, 'meleeDamage');
    if (target.debuffs?.some((d) => ['weak', 'root', 'marked'].includes(d.type))) damage += abilityValue(player, 'debuffDamage');
    if (card.id === 'basic-strike' && baseClass(player) === 'Wizard') damage += 0;
    if (player.buffs.some((b) => b.type === 'fury')) damage += player.buffs.find((b) => b.type === 'fury').value || 1;
    const barbarian = baseClass(player) === 'Barbarian';
    if (barbarian && (player.hp <= player.maxHp / 2) && abilityValue(player, 'lowHpDamage')) damage += abilityValue(player, 'lowHpDamage');
    if (target.boss && abilityValue(player, 'bossDamage')) damage += abilityValue(player, 'bossDamage');
    if (baseClass(player) === 'Wizard' && card.unique && player.roomFlags.spellHit !== true) {
      const other = game.roomState.enemies.find((e) => e.id !== target.id && e.hp > 0 && dist(e, target) <= 1);
      if (other) { dealDamage(game, player, other, 1); player.roomFlags.spellHit = true; }
    }
    if (effect.bonusVsWounded && target.hp > target.maxHp / 2) damage = Math.max(1, damage - 2);
    const hpBeforeHit = target.hp;
    dealDamage(game, player, target, damage, target === game.players.find((p) => p.id === target.id));
    if (nextAttack) player.buffs.splice(player.buffs.indexOf(nextAttack), 1);
    if (target.hp < hpBeforeHit && abilityValue(player, 'attackHeal') && !player.roomFlags.attackHealed) { player.hp = Math.min(player.maxHp, player.hp + abilityValue(player, 'attackHeal')); player.roomFlags.attackHealed = true; }
    if (target.hp < hpBeforeHit && abilityValue(player, 'hitDraw') && !player.roomFlags.hitDrew) { drawCards(player, abilityValue(player, 'hitDraw')); player.roomFlags.hitDrew = true; }
    player.focusId = target.id;
    if (effect.debuff) addDebuff(target, effect.debuff, 1 + abilityValue(player, 'debuff'));
    if (card.category === 'attack') {
      if (player.attacksThisTurn > 0 && abilityValue(player, 'openGuard')) addDebuff(target, 'weak', 1);
      player.attacksThisTurn++;
    }
    if (effect.push) pushActor(game, target, player, effect.push + abilityValue(player, 'push'));
    if (effect.push) {
      const pushDamage = abilityValue(player, 'pushDamage') + (game.roomState.modifier?.rule === 'rough_move' ? 2 : 0);
      if (pushDamage) dealDamage(game, player, target, pushDamage);
    }
    const crosscut = abilityValue(player, 'crosscut');
    if (effect.splash || crosscut) {
      let enemies = game.roomState.enemies.filter((e) => e.hp > 0 && e.id !== target.id && dist(e, target) <= (effect.splash ? effect.splash + abilityValue(player, 'splash') : 1));
      if (!effect.splash && crosscut) enemies = enemies.slice(0, crosscut);
      const splashDamage = Number(effect.splashDamage ?? (effect.splash ? effect.damage || 1 : 1)) + abilityValue(player, 'splashDamage');
      for (const enemy of enemies) {
        dealDamage(game, player, enemy, splashDamage);
        if (effect.push) pushActor(game, enemy, player, effect.push + abilityValue(player, 'push'));
      }
    }
    if (effect.lifesteal) player.hp = Math.min(player.maxHp, player.hp + effect.lifesteal + abilityValue(player, 'lifesteal'));
  } else if (effect.stealItem && isRogue(player) && action.targetKind === 'player') {
    const ally = targetByAction(game, action, 'player');
    if (!ally || ally.id === player.id || dist(player, ally) > (effect.range || 1)) return 'Choose an adjacent player.';
    applySkill(game, player, card, ally, null);
  } else {
    if (effect.target === 'ally' || effect.heal || (effect.move && effect.target === 'ally')) {
      const ally = action.targetId ? targetByAction(game, action, 'player') : player;
      if (!ally) return 'Choose yourself or a living ally.';
      const range = effect.range || 99;
      if (dist(player, ally) > range + abilityValue(player, 'range')) return 'That ally is out of range.';
      if (effect.move && effect.target === 'ally') {
        const err = movePlayer(game, ally, action.x, action.y, card); if (err) return err;
      }
      applySkill(game, player, card, ally, null);
    } else if (effect.debuff || effect.taunt || effect.target === 'enemy') {
      const enemy = targetByAction(game, action, 'enemy'); if (!enemy) return 'Choose a foe.';
      if (dist(player, enemy) > (effect.range || 4) + abilityValue(player, 'range')) return 'That foe is out of range.';
      applySkill(game, player, card, null, enemy);
    } else applySkill(game, player, card, player, null);
  }
  const handIndex = player.hand.findIndex((held) => held.uid === original.uid);
  if (handIndex >= 0) player.discard.push(...player.hand.splice(handIndex, 1));
  if (freeAttack) player.roomFlags.freeAttackSpent = true;
  if (freeSkill) player.roomFlags.freeSkillSpent = true;
  if (!freeAttack && !freeSkill) player.played++;
  if (!player.categoriesPlayed.includes(card.category)) player.categoriesPlayed.push(card.category);
  if (baseClass(player) === 'Wizard' && card.category === 'skill' && abilityValue(player, 'skillGuard')) player.guard += abilityValue(player, 'skillGuard');
  if (baseClass(player) === 'Swordsman' && card.category === 'attack' && player.focusId === action.targetId && abilityValue(player, 'focus')) addLog(game, 'Duelist focus: the follow-up hit cuts deeper.');
  const cardLabel = card.flipped ? `${original.name} → ${card.name}` : card.name;
  addLog(game, `${player.name} played ${cardLabel}.`);
  return null;
}

function applySkill(game, player, card, ally, enemy) {
  const e = card.effect || {};
  if (e.heal && ally) {
    const oldFavor = game.roomState.modifier?.rule === 'favor' && ally.id !== player.id && !game.roomState.favorHealSpent;
    const extra = abilityValue(player, 'heal') + itemValue(player, 'heal') + (baseClass(player) === 'Weaver' ? 1 : 0) + (game.roomState.modifier?.hero?.heal || 0) - (game.roomState.modifier?.rule === 'blood-price' ? 1 : 0) + (oldFavor ? 2 : 0);
    const before = ally.hp; const totalHeal = Math.max(0, e.heal + extra); ally.hp = Math.min(ally.maxHp, ally.hp + totalHeal);
    const overflow = Math.max(0, before + totalHeal - ally.maxHp);
    if (overflow && abilityValue(player, 'overflowGuard')) ally.guard += Math.min(abilityValue(player, 'overflowGuard'), overflow);
    if (oldFavor) game.roomState.favorHealSpent = true;
    if (ally.hp > before && ally.id !== player.id) player.guard += abilityValue(player, 'healGuard');
    const healDraw = (ally.id !== player.id ? abilityValue(player, 'healDraw') : 0) + itemValue(player, 'healDraw');
    if (ally.hp > before && healDraw) drawCards(player, healDraw);
  }
  if (e.shield) (ally || player).guard += e.shield + abilityValue(player, 'shield') + itemValue(player, 'shield');
  if (e.buff === 'fury') (ally || player).buffs.push({ type: 'fury', value: e.buffPower || 1, turns: 2 + abilityValue(player, 'buffDuration') });
  if (e.buff === 'evasion') player.buffs.push({ type: 'evasion', turns: 1 });
  if (e.debuff && enemy) addDebuff(enemy, e.debuff, abilityValue(player, 'debuff') + 1);
  if (e.taunt) player.buffs.push({ type: 'taunt', range: e.taunt + abilityValue(player, 'taunt'), turns: 1 + abilityValue(player, 'buffDuration') });
  if (e.cleanse && ally) ally.debuffs.splice(0, Math.max(1, e.cleanse + abilityValue(player, 'cleanse')));
  if (e.draw) drawCards(player, e.draw);
  if (e.move && ally && e.target === 'ally') ally.buffs.push({ type: 'freeMove', value: e.move, turns: 1 });
  if (e.stealItem && isRogue(player) && ally && ally !== player && dist(player, ally) <= (e.range || 1)) {
    const ix = ally.items.findIndex((item) => item.kind === 'consumable');
    if (ix >= 0) player.items.push(...ally.items.splice(ix, 1));
  }
  if (e.damage && enemy) dealDamage(game, player, enemy, e.damage + itemValue(player, 'damage'));
}

function drawCards(player, amount) {
  let drawn = 0;
  for (let i = 0; i < amount; i++) {
    if (!player.draw.length && player.discard.length) { player.draw = shuffle(player.discard); player.discard = []; }
    const card = player.draw.pop(); if (card) { player.hand.push(card); drawn++; }
  }
  if (drawn && player.ended) player.nextPlayBonus = Number(player.nextPlayBonus || 0) + drawn;
  else if (drawn && Number.isFinite(player.playLimit)) player.playLimit += drawn;
}

function addDebuff(target, type, turns = 1) {
  target.debuffs ||= [];
  const existing = target.debuffs.find((d) => d.type === type);
  if (existing) existing.turns = Math.max(existing.turns, turns); else target.debuffs.push({ type, turns });
}

function dealDamage(game, source, target, amount, isHeroTarget = false) {
  if (!target || target.hp <= 0 || amount <= 0) return;
  let damage = amount;
  if (target.debuffs?.some((d) => d.type === 'weak')) damage = Math.max(0, damage - 1);
  if (target.debuffs?.some((d) => d.type === 'daze')) damage = Math.max(0, damage - 1);
  const piercing = source && game.players.some((player) => player.id === source.id) ? abilityValue(source, 'pierce') : 0;
  if (!isHeroTarget) {
    if (target.guard > 0) { const blocked = Math.min(target.guard, Math.max(0, damage - piercing)); target.guard -= blocked; damage -= blocked; }
  } else {
    const targetPlayer = target;
    if (targetPlayer.guard > 0) { const blocked = Math.min(targetPlayer.guard, Math.max(0, damage - piercing)); targetPlayer.guard -= blocked; damage -= blocked; }
  }
  if (!damage) return;
  if (isHeroTarget && target.abilities.some((ability) => ability.id === 'bastion') && !target.roomFlags.bastion) {
    target.roomFlags.bastion = true; addLog(game, `${target.name} holds firm behind Bastion.`); return;
  }
  if (isHeroTarget && target.hp <= damage && target.abilities.some((ability) => ability.id === 'last-bastion') && !target.runFlags.lastBastion) {
    target.runFlags.lastBastion = true; addLog(game, `${target.name} survives behind the Last Bastion.`); return;
  }
  if (isHeroTarget && target.hp <= damage && target.abilities.some((ability) => ability.id === 'last-breath') && !target.runFlags.lastBreath) {
    target.runFlags.lastBreath = true; target.hp = 1; addLog(game, `${target.name} survives the lethal blow with Last Breath.`); return;
  }
  target.hp = Math.max(0, target.hp - damage);
  if (isHeroTarget) {
    for (const ally of eligiblePlayers(game)) {
      if (ally !== target && abilityValue(ally, 'allyHurtGuard')) ally.guard += abilityValue(ally, 'allyHurtGuard');
    }
  }
  if (isHeroTarget && target.hp <= 0) {
    const rescuer = game.players.find((player) => player !== target && player.abilities.some((ability) => ability.id === 'rescue-line') && !player.roomFlags.rescueAlly);
    if (rescuer) { rescuer.roomFlags.rescueAlly = true; target.hp = 1; addLog(game, `${rescuer.name} saves ${target.name} from a lethal hit.`); }
    else {
      target.dead = true; target.ended = true;
      const reviver = game.players.find((player) => abilityValue(player, 'revive') && !player.runFlags.revived);
      if (reviver) { target.dead = false; target.ended = false; target.hp = abilityValue(reviver, 'revive'); reviver.runFlags.revived = true; addLog(game, `${reviver.name} brings ${target.name} back into the fight.`); }
    }
    if (target.dead && target.artifact) {
      target.artifact = false; target.rogueStolen = false; game.roomState.artifact = 'sealed';
      addLog(game, `${target.name} falls. The relic is recovered by the crew.`);
    }
  }
  if (!isHeroTarget && target.hp <= 0) {
    addLog(game, `${target.name} falls.`);
    if (source) onKill(game, source, target);
  }
}

function onKill(game, player, target) {
  player.hp = Math.min(player.maxHp, player.hp + abilityValue(player, 'killHeal') + itemValue(player, 'killHeal'));
  player.guard += abilityValue(player, 'killGuard');
  for (const ally of eligiblePlayers(game)) if (ally !== player && abilityValue(player, 'teamKillGuard')) ally.guard += abilityValue(player, 'teamKillGuard');
  if (abilityValue(player, 'killDraw') || itemValue(player, 'killDraw')) drawCards(player, abilityValue(player, 'killDraw') + itemValue(player, 'killDraw'));
  if (abilityValue(player, 'killMove')) {
    const steps = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }));
    const open = steps.find((tile) => dist(player, tile) <= 1 && !game.roomState.map.walls.includes(`${tile.x},${tile.y}`) && !game.players.some((p) => p.id !== player.id && living(p) && p.x === tile.x && p.y === tile.y) && !game.roomState.enemies.some((e) => e.hp > 0 && e.x === tile.x && e.y === tile.y));
    if (open) movePlayer(game, player, open.x, open.y, { effect: { move: 1 } });
  }
  if (baseClass(player) === 'Barbarian' && player.items.some((i) => i.id === 'red-belt')) player.hp = Math.min(player.maxHp, player.hp + 1);
  if (player.className === 'Rogue' && target.id === player.focusId) addLog(game, 'The Rogue leaves no witness.');
}

function pushActor(game, target, source, count) {
  if (target.unpushable || abilityValue(target, 'unpushable') || target.className === 'Knight' && target.items.some((item) => item.id === 'tower-shield')) return;
  const dx = Math.sign(target.x - source.x), dy = Math.sign(target.y - source.y);
  for (let i = 0; i < count; i++) {
    const x = target.x + (dx || (Math.random() < 0.5 ? 1 : -1)), y = target.y + (dx ? 0 : dy);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || game.roomState.map.walls.includes(`${x},${y}`)) break;
    target.x = x; target.y = y;
  }
}

function reactionMove(game, mover, anchor, steps, away = false) {
  const choices = [];
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) {
    const length = dist(mover, { x, y });
    if (!length || length > steps || game.roomState.map.walls.includes(`${x},${y}`)) continue;
    if (!pathOpen(game.roomState, mover, { x, y }, steps)) continue;
    if (game.players.some((p) => p.id !== mover.id && living(p) && p.x === x && p.y === y)) continue;
    if (game.roomState.enemies.some((e) => e.hp > 0 && e.x === x && e.y === y)) continue;
    choices.push({ x, y });
  }
  choices.sort((a, b) => (away ? dist(b, anchor) - dist(a, anchor) : dist(a, anchor) - dist(b, anchor)));
  if (!choices.length) return false;
  mover.x = choices[0].x; mover.y = choices[0].y; mover.roomFlags.movedThisRound = true;
  return true;
}

function triggerReaction(game, target, attacker, ranged) {
  const adjacent = dist(target, attacker) <= 1;
  const triggers = ['self_attacked'];
  if (adjacent) triggers.push('self_adjacent_attacked');
  else if (ranged) triggers.push('self_ranged_targeted', 'self_ranged_hit');
  if (target.hp <= target.maxHp / 2) triggers.push('self_low_hp');
  const index = target.hand.findIndex((card) => card.outOfTurn && triggers.includes(card.response));
  if (index >= 0) {
    const [card] = target.hand.splice(index, 1); target.discard.push(card);
    if (card.effect.shield) target.guard += card.effect.shield + abilityValue(target, 'shield') + itemValue(target, 'shield');
    if (card.effect.cancelRanged && ranged) return -1;
    if (card.effect.evade && ranged) {
      reactionMove(game, target, attacker, card.effect.move || 1, true);
      addLog(game, `${target.name} slips out of ${attacker.name}’s attack with ${card.name}.`);
      return -1;
    }
    if (card.effect.move && reactionMove(game, target, attacker, card.effect.move, true) && dist(target, attacker) > (attacker.range || 1)) {
      addLog(game, `${target.name} blinks clear with ${card.name}.`); return -1;
    }
    if (card.effect.taunt) target.buffs.push({ type: 'taunt', range: card.effect.taunt, turns: 1 });
    if (card.effect.heal) target.hp = Math.min(target.maxHp, target.hp + card.effect.heal + abilityValue(target, 'heal') + (baseClass(target) === 'Weaver' ? 1 : 0));
    if (card.effect.debuff && attacker.hp > 0) addDebuff(attacker, card.effect.debuff, 1 + abilityValue(target, 'debuff'));
    if (card.effect.draw) drawCards(target, card.effect.draw);
    if (card.effect.damage && attacker.hp > 0 && (!card.effect.range || dist(target, attacker) <= card.effect.range)) dealDamage(game, target, attacker, card.effect.damage);
    if ((card.effect.cancelMelee && adjacent || card.id === 'riposte') && abilityValue(target, 'riposteGuard')) target.guard += abilityValue(target, 'riposteGuard');
    if (card.effect.cancelMelee && adjacent) { addLog(game, `${target.name} parries ${attacker.name}’s attack with ${card.name}.`); return -1; }
    addLog(game, `${target.name} reacts with ${card.name}.`);
  }
  const allies = eligiblePlayers(game).filter((ally) => ally !== target && dist(ally, target) <= (ranged ? 5 : 1));
  for (const ally of allies) {
    const allyAdjacent = dist(ally, target) <= 1;
    const responseNames = ['ally_attacked', ...(allyAdjacent ? ['ally_adjacent_attacked'] : []), ...(ranged ? ['ally_ranged_hit'] : []), ...(target.hp <= target.maxHp / 2 ? ['ally_low_hp'] : [])];
    const allyIndex = ally.hand.findIndex((card) => card.outOfTurn && responseNames.includes(card.response));
    if (allyIndex < 0) continue;
    const [card] = ally.hand.splice(allyIndex, 1); ally.discard.push(card);
    if (card.effect.redirect) {
      if (card.effect.shield) ally.guard += card.effect.shield + abilityValue(ally, 'shield') + itemValue(ally, 'shield');
      dealDamage(game, attacker, ally, attacker.damage, true);
      addLog(game, `${ally.name} steps in front of ${target.name} with ${card.name}.`);
      return -1;
    }
    if (card.effect.cancelRanged && ranged) { addLog(game, `${ally.name} turns aside the shot with ${card.name}.`); return -1; }
    if (card.effect.move) reactionMove(game, ally, target, card.effect.move, false);
    if (card.effect.shield) target.guard += card.effect.shield + abilityValue(ally, 'shield') + itemValue(ally, 'shield');
    if (card.effect.taunt) ally.buffs.push({ type: 'taunt', range: card.effect.taunt, turns: 1 });
    if (card.effect.heal) target.hp = Math.min(target.maxHp, target.hp + card.effect.heal + abilityValue(ally, 'heal') + (baseClass(ally) === 'Weaver' ? 1 : 0));
    if (card.effect.debuff && attacker.hp > 0) addDebuff(attacker, card.effect.debuff, 1 + abilityValue(ally, 'debuff'));
    if (card.effect.draw) drawCards(ally, card.effect.draw);
    if (card.effect.damage && attacker.hp > 0 && (!card.effect.range || dist(ally, attacker) <= card.effect.range)) dealDamage(game, ally, attacker, card.effect.damage);
    addLog(game, `${ally.name} protects ${target.name} with ${card.name}.`);
    break;
  }
  return 0;
}

function nearestPlayer(game, enemy) {
  const alive = eligiblePlayers(game);
  const taunter = alive.find((player) => player.buffs.some((b) => b.type === 'taunt' && dist(player, enemy) <= b.range));
  if (taunter) return taunter;
  return alive.sort((a, b) => dist(a, enemy) - dist(b, enemy))[0] || null;
}

function enemyPhase(game) {
  const room = game.roomState;
  room.round++;
  room.enemyFavorSpent = false;
  room.favorHealSpent = false;
  for (const enemy of room.enemies) {
    if (enemy.hp <= 0) continue;
    const rootOwner = eligiblePlayers(game).find((player) => abilityValue(player, 'rootDamage') && enemy.debuffs.some((debuff) => debuff.type === 'root'));
    if (rootOwner) dealDamage(game, rootOwner, enemy, abilityValue(rootOwner, 'rootDamage'));
    if (enemy.hp <= 0) continue;
    let target = nearestPlayer(game, enemy); if (!target) break;
    const enemyWeak = enemy.debuffs.some((d) => d.type === 'weak');
    const range = enemy.range || 1;
    if (dist(enemy, target) > range && !enemy.debuffs.some((d) => d.type === 'root')) {
      const [x, y] = moveEnemyToward(room, enemy, target, eligiblePlayers(game));
      if (x !== enemy.x || y !== enemy.y) { enemy.x = x; enemy.y = y; }
      if (enemy.range === 1 && enemy.x === target.x && enemy.y === target.y) { /* collision avoided by the path helper */ }
      for (const hero of eligiblePlayers(game)) {
        if (hero.hand.some((card) => card.outOfTurn && card.response === 'enemy_moves' && dist(hero, enemy) <= (card.effect.range || 1))) {
          const ix = hero.hand.findIndex((card) => card.outOfTurn && card.response === 'enemy_moves' && dist(hero, enemy) <= (card.effect.range || 1));
          const [card] = hero.hand.splice(ix, 1); hero.discard.push(card);
          if (card.effect.damage) dealDamage(game, hero, enemy, card.effect.damage);
          if (card.effect.debuff) addDebuff(enemy, card.effect.debuff, 1);
          addLog(game, `${hero.name} springs ${card.name}.`); break;
        }
      }
    }
    if (dist(enemy, target) > range || enemy.hp <= 0) {
      for (const d of enemy.debuffs) d.turns--;
      enemy.debuffs = enemy.debuffs.filter((d) => d.turns > 0);
      continue;
    }
    const guardian = eligiblePlayers(game).find((hero) => hero !== target && baseClass(hero) === 'Knight' && hero.abilities.some((a) => a.id === 'bodyguard') && !hero.roomFlags.bodyguardUsed && dist(hero, target) <= 1 && dist(hero, enemy) <= range);
    if (guardian) { guardian.roomFlags.bodyguardUsed = true; target = guardian; addLog(game, `${guardian.name} intercepts the first strike with Bodyguard.`); }
    const response = triggerReaction(game, target, enemy, range > 1);
    if (response < 0) { addLog(game, `${enemy.name}’s attack is turned aside.`); continue; }
    if (enemy.hp <= 0) { addLog(game, `${enemy.name} falls before it can strike.`); continue; }
    let damage = enemy.damage + (room.modifier?.enemy?.damage || 0);
    const evasion = target.buffs.find((buff) => buff.type === 'evasion');
    if (evasion) { damage = 0; target.buffs.splice(target.buffs.indexOf(evasion), 1); }
    if (room.modifier?.rule === 'favor' && !room.enemyFavorSpent) { damage++; room.enemyFavorSpent = true; }
    if (enemyWeak || enemy.debuffs.some((d) => d.type === 'slow')) damage = Math.max(0, damage - 1);
    const rootedWard = eligiblePlayers(game).reduce((sum, hero) => sum + abilityValue(hero, 'rootGuard'), 0);
    if (rootedWard && enemy.debuffs.some((d) => d.type === 'root')) damage = Math.max(0, damage - rootedWard);
    if (target.buffs.some((b) => b.type === 'taunt')) damage = Math.max(0, damage - abilityValue(target, 'tauntGuard'));
    const brutesFirst = baseClass(target) === 'Barbarian' || abilityValue(target, 'reduction');
    if (brutesFirst && !target.roomFlags.reduced) { damage = Math.max(0, damage - 1 - abilityValue(target, 'reduction')); target.roomFlags.reduced = true; }
    if (baseClass(target) === 'Knight' && target.items.some((item) => item.id === 'tower-shield')) damage = Math.max(0, damage - 1);
    if (baseClass(target) === 'Wizard' && range > 1 && target.abilities.some((a) => a.id === 'spell-shield') && !target.roomFlags.spellShielded) { damage = Math.max(0, damage - 2); target.roomFlags.spellShielded = true; }
    if (target.hp <= target.maxHp / 2 && abilityValue(target, 'lowHpGuard') && !target.roomFlags.lowHpGuarded) { target.guard += abilityValue(target, 'lowHpGuard'); target.roomFlags.lowHpGuarded = true; }
    if (abilityValue(target, 'firstAttackGuard') && !target.roomFlags.firstAttackGuarded) { target.guard += abilityValue(target, 'firstAttackGuard'); target.roomFlags.firstAttackGuarded = true; }
    const neighboringGuardian = eligiblePlayers(game).find((p) => p !== target && baseClass(p) === 'Knight' && dist(p, target) <= 1 && abilityValue(p, 'allyGuard'));
    if (neighboringGuardian) { damage = Math.max(0, damage - abilityValue(neighboringGuardian, 'allyGuard')); if (abilityValue(neighboringGuardian, 'allyDraw')) drawCards(neighboringGuardian, abilityValue(neighboringGuardian, 'allyDraw')); }
    if (abilityValue(target, 'evade') && !target.roomFlags.evaded && (range > 1 || baseClass(target) === 'Wizard')) { damage = 0; target.roomFlags.evaded = true; }
    if (target.debuffs.some((d) => d.type === 'root') && abilityValue(target, 'cleanse')) target.debuffs = target.debuffs.filter((d) => d.type !== 'root');
    dealDamage(game, enemy, target, damage, true);
    if (damage && abilityValue(target, 'thorns') && enemy.hp > 0) dealDamage(game, target, enemy, abilityValue(target, 'thorns'));
    if (damage && enemy.name === 'Basilisk') addDebuff(target, 'daze', 1);
    if (damage && enemy.name === 'Cockatrice') addDebuff(target, 'root', 1);
    if (damage && enemy.name === 'King') addDebuff(target, 'weak', 1);
    if (damage && enemy.name === 'Guard Dog') addDebuff(target, 'root', 1);
    if (damage && enemy.name === 'Zombie') addDebuff(target, 'weak', 1);
    if (damage && ['Horse', 'Beast', 'Gryphon'].includes(enemy.name)) pushActor(game, target, enemy, 1);
    if (damage && enemy.name === 'Gryphon') {
      for (const nearby of eligiblePlayers(game).filter((hero) => hero !== target && dist(hero, target) <= 1)) dealDamage(game, enemy, nearby, 1, true);
    }
    if (damage) addLog(game, `${enemy.name} hits ${target.name} for ${damage}.`);
    for (const d of enemy.debuffs) d.turns--;
    enemy.debuffs = enemy.debuffs.filter((d) => d.turns > 0);
  }
  for (const p of eligiblePlayers(game)) {
    for (const buff of p.buffs) if (buff.turns > 0) buff.turns--;
    p.buffs = p.buffs.filter((buff) => buff.turns > 0 || buff.type === 'fury' && p.hand.some((c) => c.effect.damage));
    for (const debuff of p.debuffs) debuff.turns--;
    p.debuffs = p.debuffs.filter((debuff) => debuff.turns > 0);
    p.roomFlags.reduced = false; p.roomFlags.evaded = false; p.roomFlags.spellHit = false; p.roomFlags.spellShielded = false; p.roomFlags.doubleTap = false;
    p.roomFlags.openingStrike = false; p.roomFlags.movedThisRound = false; p.roomFlags.freeSkillSpent = false;
    p.roomFlags.attackHealed = false; p.roomFlags.hitDrew = false;
  }
  if (!alivePlayers(game).length) { game.phase = 'defeat'; addLog(game, 'The whole party has fallen.'); return; }
  if (room.enemies.every((enemy) => enemy.hp <= 0)) { beginReward(game); return; }
  for (const player of eligiblePlayers(game)) startTurn(player, room.modifier);
}

function moveEnemyToward(room, enemy, target, heroes = []) {
  const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: enemy.x + dx, y: enemy.y + dy }));
  const free = options.filter((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE && !room.map.walls.includes(`${p.x},${p.y}`) && !(p.x === target.x && p.y === target.y) && !room.enemies.some((e) => e !== enemy && e.hp > 0 && e.x === p.x && e.y === p.y) && !heroes.some((hero) => hero.id !== target.id && hero.x === p.x && hero.y === p.y));
  free.sort((a, b) => dist(a, target) - dist(b, target));
  return free.length ? [free[0].x, free[0].y] : [enemy.x, enemy.y];
}

function matchingReactionCards(player, prompt, enemy, target, ranged) {
  let triggers = [];
  if (prompt === 'enemy_moves') triggers = ['enemy_moves'];
  else if (player.id === target.id) {
    triggers = ['self_attacked'];
    if (dist(player, enemy) <= 1) triggers.push('self_adjacent_attacked');
    else if (ranged) triggers.push('self_ranged_targeted', 'self_ranged_hit');
    if (player.hp <= player.maxHp / 2) triggers.push('self_low_hp');
  } else {
    triggers = ['ally_attacked'];
    if (dist(player, target) <= 1) triggers.push('ally_adjacent_attacked');
    if (ranged) triggers.push('ally_ranged_hit');
    if (target.hp <= target.maxHp / 2) triggers.push('ally_low_hp');
  }
  return player.hand.filter((card) => card.outOfTurn && triggers.includes(card.response));
}

function openNextReaction(game) {
  const room = game.roomState, turn = room.enemyTurn;
  while (turn.reactionIndex < turn.reactionQueue.length) {
    const responder = turn.reactionQueue[turn.reactionIndex++];
    const player = actor(game, responder.playerId), enemy = room.enemies.find((item) => item.id === turn.currentEnemyId);
    const target = game.players.find((item) => item.id === turn.targetId);
    if (!living(player) || !enemy || enemy.hp <= 0 || !living(target)) continue;
    const cards = matchingReactionCards(player, responder.trigger, enemy, target, turn.range > 1);
    if (!cards.length) continue;
    room.reactionPrompt = {
      playerId: player.id, enemyId: enemy.id, enemyName: enemy.name, targetId: target.id,
      targetName: target.name, role: responder.role, trigger: responder.trigger,
      cardIds: cards.map((card) => card.uid)
    };
    addLog(game, `${player.name} has a reaction window: ${responder.trigger === 'enemy_moves' ? `${enemy.name} moved` : `${enemy.name} is attacking ${target.name}`}.`);
    return true;
  }
  room.reactionPrompt = null;
  turn.stage = turn.afterReactions;
  return false;
}

function queueEnemyMoveReactions(game, enemy) {
  const turn = game.roomState.enemyTurn;
  const responders = eligiblePlayers(game).filter((player) => matchingReactionCards(player, 'enemy_moves', enemy, player, false).some((card) => dist(player, enemy) <= (card.effect.range || 1)));
  turn.reactionQueue = responders.map((player) => ({ playerId: player.id, role: 'observer', trigger: 'enemy_moves' }));
  turn.reactionIndex = 0; turn.afterReactions = 'attack'; turn.stage = 'reactions';
  openNextReaction(game);
}

function queueEnemyAttackReactions(game, enemy, target, range) {
  const turn = game.roomState.enemyTurn;
  const ranged = range > 1;
  const allies = eligiblePlayers(game).filter((player) => player !== target && dist(player, target) <= (ranged ? 5 : 1));
  turn.reactionQueue = [target, ...allies].map((player) => ({ playerId: player.id, role: player.id === target.id ? 'target' : 'ally', trigger: 'attack' }));
  turn.reactionIndex = 0; turn.afterReactions = 'hit'; turn.stage = 'reactions';
  openNextReaction(game);
}

function applyReactionCard(game, player, card, prompt) {
  const room = game.roomState, turn = room.enemyTurn;
  const enemy = room.enemies.find((item) => item.id === turn.currentEnemyId);
  const target = game.players.find((item) => item.id === turn.targetId);
  if (!enemy || !target || !living(player)) return 'The reaction is no longer available.';
  const heldIndex = player.hand.findIndex((item) => item.uid === card.uid);
  if (heldIndex < 0) return 'That reaction card is no longer in your hand.';
  player.discard.push(...player.hand.splice(heldIndex, 1));
  const effect = card.effect || {};
  const shield = Number(effect.shield || 0) + abilityValue(player, 'shield') + itemValue(player, 'shield');
  const heal = Number(effect.heal || 0) + abilityValue(player, 'heal') + (baseClass(player) === 'Weaver' ? 1 : 0);
  const enemyMoves = prompt.trigger === 'enemy_moves';
  const isTarget = prompt.role === 'target';
  const recipient = isTarget ? target : player;

  if (enemyMoves) {
    if (effect.damage && dist(player, enemy) <= (effect.range || 1)) dealDamage(game, player, enemy, effect.damage);
    if (effect.debuff && dist(player, enemy) <= (effect.range || 1)) addDebuff(enemy, effect.debuff, 1 + abilityValue(player, 'debuff'));
    if (effect.push && dist(player, enemy) <= (effect.range || 1)) pushActor(game, enemy, player, effect.push);
    addLog(game, `${player.name} springs ${card.name} as ${enemy.name} moves.`);
    return null;
  }

  if (effect.redirect && !isTarget) {
    if (shield) player.guard += shield;
    const guardBefore = player.guard;
    dealDamage(game, enemy, player, enemy.damage + (room.modifier?.enemy?.damage || 0), true);
    const blocked = Math.max(0, guardBefore - player.guard);
    addLog(game, `${player.name} steps in front of ${target.name} with ${card.name}${blocked ? ` (${blocked} damage caught by guard)` : ''}.`);
    turn.cancelled = true;
    return null;
  }
  if (effect.shield) recipient.guard += shield;
  if (effect.heal) recipient.hp = Math.min(recipient.maxHp, recipient.hp + heal);
  if (effect.taunt) player.buffs.push({ type: 'taunt', range: effect.taunt + abilityValue(player, 'taunt'), turns: 1 + abilityValue(player, 'buffDuration') });
  if (effect.draw) drawCards(player, effect.draw);
  if (effect.debuff && enemy.hp > 0 && (isTarget || !effect.range || dist(player, enemy) <= effect.range)) addDebuff(enemy, effect.debuff, 1 + abilityValue(player, 'debuff'));
  if (effect.damage && enemy.hp > 0 && (!effect.range || dist(player, enemy) <= effect.range)) dealDamage(game, player, enemy, effect.damage);
  if (effect.push && enemy.hp > 0 && dist(player, enemy) <= (effect.range || 1)) pushActor(game, enemy, player, effect.push);

  if (effect.cancelRanged && turn.range > 1) turn.cancelled = true;
  if (effect.evade && turn.range > 1) {
    reactionMove(game, target, enemy, effect.move || 1, true);
    turn.cancelled = true;
  } else if (effect.move && isTarget && reactionMove(game, target, enemy, effect.move, true) && dist(target, enemy) > turn.range) turn.cancelled = true;
  if (effect.move && !isTarget) reactionMove(game, player, target, effect.move, false);
  if (effect.cancelMelee && dist(target, enemy) <= 1) turn.cancelled = true;
  if (turn.cancelled) addLog(game, `${player.name} stops ${enemy.name}’s attack with ${card.name}.`);
  else addLog(game, `${player.name} answers the attack with ${card.name}.`);
  return null;
}

function enemyPhase(game) {
  const room = game.roomState;
  room.round++;
  room.enemyFavorSpent = false; room.favorHealSpent = false;
  room.enemyTurn = { ids: room.enemies.map((enemy) => enemy.id), index: 0, currentEnemyId: null, targetId: null, stage: 'move', reactionQueue: [], reactionIndex: 0, cancelled: false, range: 1 };
  room.reactionPrompt = null;
  addLog(game, `Round ${room.round}: the castle company takes its turn.`);
}

function finishEnemyAction(game, enemy) {
  if (enemy) {
    for (const debuff of enemy.debuffs) debuff.turns--;
    enemy.debuffs = enemy.debuffs.filter((debuff) => debuff.turns > 0);
  }
  const turn = game.roomState.enemyTurn;
  turn.index++; turn.currentEnemyId = null; turn.targetId = null; turn.stage = 'move'; turn.cancelled = false;
  turn.reactionQueue = []; turn.reactionIndex = 0;
}

function finishEnemyPhase(game) {
  const room = game.roomState;
  room.enemyTurn = null; room.reactionPrompt = null;
  for (const player of eligiblePlayers(game)) {
    for (const buff of player.buffs) if (buff.turns > 0) buff.turns--;
    player.buffs = player.buffs.filter((buff) => buff.turns > 0 || buff.type === 'fury' && player.hand.some((card) => card.effect.damage));
    for (const debuff of player.debuffs) debuff.turns--;
    player.debuffs = player.debuffs.filter((debuff) => debuff.turns > 0);
    player.roomFlags.reduced = false; player.roomFlags.evaded = false; player.roomFlags.spellHit = false; player.roomFlags.spellShielded = false; player.roomFlags.doubleTap = false;
    player.roomFlags.openingStrike = false; player.roomFlags.movedThisRound = false; player.roomFlags.freeSkillSpent = false;
    player.roomFlags.attackHealed = false; player.roomFlags.hitDrew = false;
  }
  if (!alivePlayers(game).length) { game.phase = 'defeat'; addLog(game, 'The whole party has fallen.'); return; }
  if (room.enemies.every((enemy) => enemy.hp <= 0)) { beginReward(game); return; }
  for (const player of eligiblePlayers(game)) startTurn(player, room.modifier);
  addLog(game, 'The enemy turn ends. Your crew can act again.');
}

function advanceEnemyPhase(game) {
  const room = game.roomState, turn = room?.enemyTurn;
  if (!turn || room.reactionPrompt || game.phase !== 'battle') return;
  if (turn.stage === 'move') {
    while (turn.index < turn.ids.length) {
      const enemy = room.enemies.find((item) => item.id === turn.ids[turn.index]);
      if (enemy && enemy.hp > 0) break;
      turn.index++;
    }
    if (turn.index >= turn.ids.length) { finishEnemyPhase(game); return; }
    const enemy = room.enemies.find((item) => item.id === turn.ids[turn.index]);
    turn.currentEnemyId = enemy.id; turn.cancelled = false;
    const rootOwner = eligiblePlayers(game).find((player) => abilityValue(player, 'rootDamage') && enemy.debuffs.some((debuff) => debuff.type === 'root'));
    if (rootOwner) dealDamage(game, rootOwner, enemy, abilityValue(rootOwner, 'rootDamage'));
    if (enemy.hp <= 0) { addLog(game, `${enemy.name} falls before acting.`); finishEnemyAction(game, enemy); return; }
    const target = nearestPlayer(game, enemy);
    if (!target) { finishEnemyAction(game, enemy); return; }
    turn.targetId = target.id; turn.range = enemy.range || 1;
    const start = { x: enemy.x, y: enemy.y };
    if (dist(enemy, target) > turn.range && !enemy.debuffs.some((debuff) => debuff.type === 'root')) {
      const [x, y] = moveEnemyToward(room, enemy, target, eligiblePlayers(game), turn.range);
      enemy.x = x; enemy.y = y;
    }
    if (enemy.x !== start.x || enemy.y !== start.y) addLog(game, `${enemy.name} advances from ${start.x + 1},${start.y + 1} toward ${target.name} (${enemy.x + 1},${enemy.y + 1}).`);
    else addLog(game, `${enemy.name} holds position near ${target.name}.`);
    turn.stage = 'attack';
    if (enemy.x !== start.x || enemy.y !== start.y) queueEnemyMoveReactions(game, enemy);
    return;
  }
  if (turn.stage === 'attack') {
    const enemy = room.enemies.find((item) => item.id === turn.currentEnemyId);
    if (!enemy || enemy.hp <= 0) { finishEnemyAction(game, enemy); return; }
    let target = game.players.find((item) => item.id === turn.targetId && living(item));
    if (!target || dist(enemy, target) > turn.range) { target = nearestPlayer(game, enemy); turn.targetId = target?.id || null; }
    if (!target || dist(enemy, target) > turn.range) {
      addLog(game, `${enemy.name} cannot reach a hero this turn.`); finishEnemyAction(game, enemy); return;
    }
    const guardian = eligiblePlayers(game).find((hero) => hero !== target && baseClass(hero) === 'Knight' && hero.abilities.some((ability) => ability.id === 'bodyguard') && !hero.roomFlags.bodyguardUsed && dist(hero, target) <= 1 && dist(hero, enemy) <= turn.range);
    if (guardian) { guardian.roomFlags.bodyguardUsed = true; target = guardian; turn.targetId = guardian.id; addLog(game, `${guardian.name} intercepts the strike with Bodyguard.`); }
    addLog(game, `${enemy.name} prepares to attack ${target.name}.`);
    queueEnemyAttackReactions(game, enemy, target, turn.range);
    if (!room.reactionPrompt && turn.stage === 'hit') return;
    return;
  }
  if (turn.stage === 'hit') {
    const enemy = room.enemies.find((item) => item.id === turn.currentEnemyId);
    const target = game.players.find((item) => item.id === turn.targetId && living(item));
    if (!enemy || enemy.hp <= 0) { addLog(game, `${enemy?.name || 'The attacker'} falls before the strike.`); finishEnemyAction(game, enemy); return; }
    if (turn.cancelled) { addLog(game, `${enemy.name}’s attack is turned aside.`); finishEnemyAction(game, enemy); return; }
    if (!target || dist(enemy, target) > turn.range) { addLog(game, `${enemy.name} misses after ${target?.name || 'its target'} moves clear.`); finishEnemyAction(game, enemy); return; }
    const enemyWeak = enemy.debuffs.some((debuff) => debuff.type === 'weak');
    let damage = enemy.damage + (room.modifier?.enemy?.damage || 0);
    const evasion = target.buffs.find((buff) => buff.type === 'evasion');
    if (evasion) { damage = 0; target.buffs.splice(target.buffs.indexOf(evasion), 1); }
    if (room.modifier?.rule === 'favor' && !room.enemyFavorSpent) { damage++; room.enemyFavorSpent = true; }
    if (enemyWeak || enemy.debuffs.some((debuff) => debuff.type === 'slow')) damage = Math.max(0, damage - 1);
    const rootedWard = eligiblePlayers(game).reduce((sum, hero) => sum + abilityValue(hero, 'rootGuard'), 0);
    if (rootedWard && enemy.debuffs.some((debuff) => debuff.type === 'root')) damage = Math.max(0, damage - rootedWard);
    if (target.buffs.some((buff) => buff.type === 'taunt')) damage = Math.max(0, damage - abilityValue(target, 'tauntGuard'));
    const brutesFirst = baseClass(target) === 'Barbarian' || abilityValue(target, 'reduction');
    if (brutesFirst && !target.roomFlags.reduced) { damage = Math.max(0, damage - 1 - abilityValue(target, 'reduction')); target.roomFlags.reduced = true; }
    if (baseClass(target) === 'Knight' && target.items.some((item) => item.id === 'tower-shield')) damage = Math.max(0, damage - 1);
    if (baseClass(target) === 'Wizard' && turn.range > 1 && target.abilities.some((ability) => ability.id === 'spell-shield') && !target.roomFlags.spellShielded) { damage = Math.max(0, damage - 2); target.roomFlags.spellShielded = true; }
    if (target.hp <= target.maxHp / 2 && abilityValue(target, 'lowHpGuard') && !target.roomFlags.lowHpGuarded) { target.guard += abilityValue(target, 'lowHpGuard'); target.roomFlags.lowHpGuarded = true; }
    if (abilityValue(target, 'firstAttackGuard') && !target.roomFlags.firstAttackGuarded) { target.guard += abilityValue(target, 'firstAttackGuard'); target.roomFlags.firstAttackGuarded = true; }
    const neighboringGuardian = eligiblePlayers(game).find((player) => player !== target && baseClass(player) === 'Knight' && dist(player, target) <= 1 && abilityValue(player, 'allyGuard'));
    if (neighboringGuardian) { damage = Math.max(0, damage - abilityValue(neighboringGuardian, 'allyGuard')); if (abilityValue(neighboringGuardian, 'allyDraw')) drawCards(neighboringGuardian, abilityValue(neighboringGuardian, 'allyDraw')); }
    if (abilityValue(target, 'evade') && !target.roomFlags.evaded && (turn.range > 1 || baseClass(target) === 'Wizard')) { damage = 0; target.roomFlags.evaded = true; }
    if (target.debuffs.some((debuff) => debuff.type === 'root') && abilityValue(target, 'cleanse')) target.debuffs = target.debuffs.filter((debuff) => debuff.type !== 'root');
    const oldHp = target.hp, oldGuard = target.guard;
    dealDamage(game, enemy, target, damage, true);
    const hpLost = Math.max(0, oldHp - target.hp), guardUsed = Math.max(0, oldGuard - target.guard);
    if (hpLost && abilityValue(target, 'thorns') && enemy.hp > 0) dealDamage(game, target, enemy, abilityValue(target, 'thorns'));
    if (hpLost && enemy.name === 'Basilisk') addDebuff(target, 'daze', 1);
    if (hpLost && enemy.name === 'Cockatrice') addDebuff(target, 'root', 1);
    if (hpLost && enemy.name === 'King') addDebuff(target, 'weak', 1);
    if (hpLost && enemy.name === 'Guard Dog') addDebuff(target, 'root', 1);
    if (hpLost && enemy.name === 'Zombie') addDebuff(target, 'weak', 1);
    if (hpLost && ['Horse', 'Beast', 'Gryphon'].includes(enemy.name)) pushActor(game, target, enemy, 1);
    if (hpLost && enemy.name === 'Gryphon') for (const nearby of eligiblePlayers(game).filter((hero) => hero !== target && dist(hero, target) <= 1)) dealDamage(game, enemy, nearby, 1, true);
    addLog(game, hpLost ? `${enemy.name} strikes ${target.name} for ${hpLost} HP${guardUsed ? ` (${guardUsed} blocked by guard)` : ''}.` : `${enemy.name} strikes ${target.name}, but guard and defenses stop the blow.`);
    finishEnemyAction(game, enemy);
  }
}

function moveEnemyToward(room, enemy, target, heroes = [], attackRange = 1) {
  const walls = new Set(room.map.walls);
  const blocked = new Set([
    ...room.enemies.filter((other) => other !== enemy && other.hp > 0).map((other) => `${other.x},${other.y}`),
    ...heroes.filter(living).map((hero) => `${hero.x},${hero.y}`)
  ]);
  const startKey = `${enemy.x},${enemy.y}`;
  const queue = [{ x: enemy.x, y: enemy.y, first: null }];
  const seen = new Set([startKey]);
  let closest = queue[0], closestDistance = dist(enemy, target);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const distance = dist(current, target);
    if (distance < closestDistance) { closest = current; closestDistance = distance; }
    if (distance <= attackRange && current.first) return [current.first.x, current.first.y];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = current.x + dx, y = current.y + dy, key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || walls.has(key) || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      const step = { x, y };
      queue.push({ x, y, first: current.first || step });
    }
  }
  return closest.first ? [closest.first.x, closest.first.y] : [enemy.x, enemy.y];
}

function randomOffers(player) {
  const subclass = D.getAbilityList(baseClass(player), player.subclass);
  const owned = new Set(player.abilities.map((a) => a.id));
  const pool = subclass.filter(([name]) => !owned.has(name.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
  return shuffle(pool.length >= 3 ? pool : subclass).slice(0, 3).map(([name, text, effect, value]) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, text, effect, value
  }));
}

function beginReward(game) {
  game.phase = 'reward';
  for (const player of eligiblePlayers(game)) {
    if (abilityValue(player, 'roomDraw')) drawCards(player, abilityValue(player, 'roomDraw'));
    if (game.roomState.enemies.some((enemy) => enemy.boss) && abilityValue(player, 'bossHeal')) player.hp = Math.min(player.maxHp, player.hp + abilityValue(player, 'bossHeal'));
  }
  if (game.roomState.modifier?.rule === 'dim_start') for (const player of eligiblePlayers(game)) player.hp = Math.min(player.maxHp, player.hp + 2);
  const claimCount = Math.ceil(eligiblePlayers(game).length / 2);
  const items = shuffle(D.ITEMS).slice(0, claimCount).map((item, i) => ({ ...D.clone(item), slot: i, claimedBy: null }));
  const choices = {};
  const livingParty = eligiblePlayers(game);
  for (const player of livingParty) {
    player.level++;
    choices[player.id] = { abilityOptions: randomOffers(player), abilityChosen: false, subclassOptions: game.roomState.room === 6 && !player.subclass ? D.SUBCLASSES[player.className] || D.SUBCLASSES[baseClass(player)] : null, ready: false };
  }
  const rotate = livingParty.length ? (game.roomState.room - 1) % livingParty.length : 0;
  const draftOrder = [...livingParty.slice(rotate), ...livingParty.slice(0, rotate)].map((player) => player.id);
  game.reward = { items, choices, itemClaims: 0, draftOrder, draftIndex: 0, drafted: [] };
  addLog(game, `Room ${game.roomState.room} cleared. Choose an ability; the crew will draft ${claimCount} item${claimCount === 1 ? '' : 's'} in rotating order.`);
  if (!items.length) game.reward.draftIndex = draftOrder.length;
}

function advanceLootDraft(game) {
  const reward = game.reward;
  if (!reward) return;
  reward.draftIndex++;
  const itemsLeft = reward.items.some((item) => !item.claimedBy);
  while (reward.draftIndex < reward.draftOrder.length && reward.drafted.includes(reward.draftOrder[reward.draftIndex])) reward.draftIndex++;
  if (!itemsLeft || reward.draftIndex >= reward.draftOrder.length) {
    for (const item of reward.items) if (!item.claimedBy) item.claimedBy = 'left';
    reward.draftIndex = reward.draftOrder.length;
  }
}

function currentDrafter(game) {
  const reward = game.reward;
  return reward?.draftOrder?.[reward.draftIndex] || null;
}

function lootDraftComplete(game) {
  return !game.reward || game.reward.items.every((item) => !!item.claimedBy);
}

function chooseSubclass(game, player, name) {
  const options = D.SUBCLASSES[player.className] || D.SUBCLASSES[baseClass(player)];
  if (!options?.includes(name)) return 'That subclass is not available.';
  player.subclass = name;
  const damageFocus = ['Archmage', 'Hexweaver', 'Reaver', 'Deadeye', 'Bounty Hunter', 'Justiciar', 'Assassin'].includes(name);
  for (const card of [...player.draw, ...player.discard, ...player.hand]) {
    if (!card.unique || card.owner !== player.id) continue;
    card.upgraded = true; card.upgradeFocus = damageFocus ? 'damage' : 'utility';
    const preferred = damageFocus ? ['damage', 'debuff', 'shield', 'range'] : ['heal', 'shield', 'draw', 'move', 'debuff', 'range'];
    const effectKey = preferred.find((key) => Number(card.effect[key]) > 0);
    if (effectKey) { card.effect[effectKey] += 1; card.text += ` · Evolved: +1 ${effectKey}`; }
    else if (card.effect.range) card.effect.range += 1;
    card.name = `${card.name} +`;
  }
  return null;
}

function grantItem(player, itemData) {
  const effect = itemData.effect || {};
  const classBonus = itemData.classBonus?.[player.className] || itemData.classBonus?.[baseClass(player)] || 0;
  if (itemData.kind === 'consumable') {
    player.items.push({ ...D.clone(itemData), used: false });
    return;
  }
  const item = { id: itemData.id, name: itemData.name, kind: itemData.kind, text: itemData.text, ...effect };
  if (itemData.classBonus) {
    if (itemData.id === 'raven-ring' && baseClass(player) === 'Wizard') item.hand += classBonus;
    else if (itemData.id === 'wolf-cloak' && baseClass(player) === 'Ranger') item.move += classBonus;
    else if (itemData.id === 'red-belt' && baseClass(player) === 'Barbarian') item.damage += classBonus;
    else if (itemData.id === 'needle' && baseClass(player) === 'Weaver') item.healDraw += classBonus;
    else if (itemData.id === 'duel-glove' && baseClass(player) === 'Swordsman') item.focusDamage += classBonus;
    else if (itemData.id === 'iron-charm' && baseClass(player) === 'Knight') item.startGuard += classBonus;
    else if (itemData.id === 'tower-shield' && baseClass(player) === 'Knight') item.shield += classBonus;
  }
  player.items.push(item);
}

function continueAfterReward(game) {
  if (!game.reward || !Object.values(game.reward.choices).every((c) => c.abilityChosen && c.ready)) return 'Everyone must choose an ability and ready up.';
  if (game.reward.items.some((item) => !item.claimedBy)) return 'Finish the party loot draft before leaving.';
  const roomNo = game.roomState.room;
  game.reward = null;
  if (roomNo < 12) {
    game.roomState = createRoom(roomNo + 1, eligiblePlayers(game)); game.phase = 'battle';
  } else {
    game.phase = 'escape'; game.roomState.turnLog = ['The basilisk vault is clear. Reach the marked gate with the artifact.'];
    game.roomState.enemies = [];
    if (isRogue(eligiblePlayers(game)[0]) && eligiblePlayers(game).length === 1) { eligiblePlayers(game)[0].artifact = true; game.roomState.artifact = 'rogue'; }
  }
  return null;
}

function escape(game, player) {
  if (game.phase !== 'escape') return 'The exit is not open yet.';
  if (player.dead) return 'A fallen hero cannot escape.';
  const exit = game.roomState.exit;
  if (player.x !== exit.x || player.y !== exit.y) return 'Move onto the red gate tile first.';
  player.escaped = true;
  if (player.artifact && isRogue(player)) {
    game.phase = 'victory'; game.winner = 'Rogue'; addLog(game, `${player.name} slips away with the artifact.`); return null;
  }
  const partyEscaped = eligiblePlayers(game).some((p) => p.escaped && !p.artifact);
  if (partyEscaped && game.roomState.artifact !== 'rogue') { game.phase = 'victory'; game.winner = 'Party'; addLog(game, 'The party escapes with the artifact.'); }
  return null;
}

function stealArtifact(game, player) {
  if (!isRogue(player) || game.roomState.room !== 12 || game.phase !== 'battle' || game.roomState.artifact !== 'sealed') return 'The artifact is not available to steal.';
  const boss = game.roomState.enemies.find((e) => e.boss && e.hp > 0);
  if (!boss || dist(player, boss) > 1) return 'Stand beside the living vault guardian to attempt the theft.';
  const chance = player.subclass === 'Thief' || player.items.some((i) => i.id === 'fox-coin') ? 0.67 : 0.4;
  if (Math.random() < chance) { player.artifact = true; player.rogueStolen = true; game.roomState.artifact = 'rogue'; addLog(game, `${player.name} steals the artifact during the fight!`); }
  else addLog(game, `${player.name} reaches for the artifact and is spotted!`);
  return null;
}

function useItem(game, player, itemId, targetId) {
  const index = player.items.findIndex((item) => item.id === itemId && item.kind === 'consumable');
  if (index < 0) return 'You do not have that consumable.';
  const item = player.items[index], effect = item.effect || item;
  const target = targetId ? game.players.find((p) => p.id === targetId && living(p)) : player;
  if (!target) return 'Choose yourself or a living ally.';
  if (effect.heal) target.hp = Math.min(target.maxHp, target.hp + effect.heal);
  if (effect.shield) target.guard += effect.shield;
  if (effect.buff === 'fury') target.buffs.push({ type: 'fury', value: effect.buffPower || 3, turns: 2 });
  if (effect.buff === 'nextAttack') target.buffs.push({ type: 'nextAttack', value: effect.buffPower || 3, turns: 999 });
  if (effect.cleanse) target.debuffs = [];
  if (effect.damage) {
    const enemy = game.roomState.enemies.filter((e) => e.hp > 0).sort((a, b) => dist(player, a) - dist(player, b))[0];
    if (enemy && dist(player, enemy) <= (effect.range || 99)) dealDamage(game, player, enemy, effect.damage);
  }
  if (effect.move) player.buffs.push({ type: 'freeMove', value: effect.move, turns: 1 });
  player.items.splice(index, 1); addLog(game, `${player.name} uses ${item.name}.`);
  return null;
}

function handleAction(game, action) {
  const player = actor(game, action.playerId); if (!player) return 'Your seat is no longer in this room.';
  const prompt = game.roomState?.reactionPrompt;
  if (prompt && action.kind !== 'react' && action.kind !== 'passReaction') return `${game.players.find((item) => item.id === prompt.playerId)?.name || 'A player'} must resolve the reaction first.`;
  if (game.roomState?.enemyTurn && !['react', 'passReaction'].includes(action.kind)) return 'The castle company is taking its turn. Wait for the next prompt.';
  switch (action.kind) {
    case 'start': {
      if (game.phase !== 'lobby') return 'This run has already started.';
      if (game.players.length < 2 || game.players.length > MAX_PLAYERS) return 'A run needs 2–6 players.';
      if (action.rogueEnabled && game.players.length < 3) return 'Rogue mode requires at least three players.';
      dealClasses(game, !!action.rogueEnabled);
      game.roomState = createRoom(1, eligiblePlayers(game)); game.phase = 'battle'; game.reward = null;
      addLog(game, `The host deals distinct classes${game.rogueEnabled ? ', with a Rogue in the mix' : ''}.`);
      return null;
    }
    case 'play': if (game.phase !== 'battle') return 'Cards can only be played during a fight.'; return useCard(game, player, action);
    case 'discardCard': {
      if (game.phase !== 'battle') return 'Cards can only be discarded during a fight.';
      if (player.ended) return 'Your turn is already ended.';
      if (player.played >= Number(player.playLimit || 2)) return `You have used all ${Number(player.playLimit || 2)} card plays this turn.`;
      const index = player.hand.findIndex((card) => card.uid === action.cardId);
      if (index < 0) return 'That card is no longer in your hand.';
      const [card] = player.hand.splice(index, 1); player.discard.push(card); player.played++;
      addLog(game, `${player.name} discards ${card.name} instead of playing it.`);
      return null;
    }
    case 'react':
    case 'passReaction': {
      if (game.phase !== 'battle' || !prompt) return 'There is no open reaction window.';
      if (prompt.playerId !== player.id) return 'It is another player’s reaction window.';
      if (action.kind === 'react') {
        if (!prompt.cardIds.includes(action.cardId)) return 'That card cannot answer this trigger.';
        const card = player.hand.find((held) => held.uid === action.cardId);
        if (!card) return 'That reaction card is no longer in your hand.';
        const error = applyReactionCard(game, player, card, prompt);
        if (error) return error;
      } else addLog(game, `${player.name} passes on the reaction.`);
      game.roomState.reactionPrompt = null;
      if (!game.roomState.enemyTurn.cancelled) openNextReaction(game);
      else { game.roomState.enemyTurn.stage = game.roomState.enemyTurn.afterReactions; }
      return null;
    }
    case 'end': {
      if (game.phase !== 'battle') return 'There is no active turn.';
      if (player.ended) return 'You already ended this turn.';
      player.ended = true;
      if (baseClass(player) === 'Weaver') {
        const friend = eligiblePlayers(game).filter((p) => p !== player).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (friend && friend.hp < friend.maxHp) friend.hp++;
      }
      if (player.abilities.some((a) => a.effect === 'steadyPulse')) {
        const friend = eligiblePlayers(game).filter((p) => p !== player && p.hp < p.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (friend) friend.hp++;
      }
      if (player.hand.length && abilityValue(player, 'endHandGuard')) player.guard += abilityValue(player, 'endHandGuard');
      addLog(game, `${player.name} ends their turn.`);
      if (eligiblePlayers(game).every((p) => p.ended)) enemyPhase(game);
      return null;
    }
    case 'chooseAbility': {
      if (game.phase !== 'reward') return 'There is no reward to choose.';
      const choice = game.reward.choices[player.id]; if (!choice?.abilityOptions.some((offer) => offer.id === action.abilityId)) return 'That ability is not one of your offers.';
      if (choice.abilityChosen) return 'You already chose this room’s ability.';
      const selected = choice.abilityOptions.find((offer) => offer.id === action.abilityId);
      player.abilities.push({ ...selected });
      if (selected.effect === 'maxHp') { player.maxHp += selected.value; player.hp += selected.value; }
      choice.abilityChosen = true; return null;
    }
    case 'chooseSubclass': {
      if (game.phase !== 'reward') return 'Subclasses are chosen after clearing Room 6.';
      const choice = game.reward.choices[player.id]; if (!choice?.subclassOptions?.includes(action.subclass)) return 'That subclass is not one of your choices.';
      const error = chooseSubclass(game, player, action.subclass); if (error) return error;
      choice.subclassOptions = null; choice.abilityOptions = randomOffers(player); return null;
    }
    case 'claimItem': {
      if (game.phase !== 'reward') return 'There is no reward to claim.';
      const drafterId = currentDrafter(game);
      if (!drafterId) return 'The party loot draft is complete.';
      if (drafterId !== player.id) return `It is ${game.players.find((member) => member.id === drafterId)?.name || 'another player'}’s loot pick.`;
      if (game.reward.drafted.includes(player.id)) return 'You already took your turn in the loot draft.';
      const item = game.reward.items.find((i) => i.slot === action.slot && !i.claimedBy);
      if (!item) return 'That item has already been claimed.';
      const recipient = game.players.find((member) => member.id === action.recipientId && living(member));
      if (!recipient) return 'Choose a living crew member to receive the item.';
      item.claimedBy = recipient.id; item.pickedBy = player.id; game.reward.itemClaims++; game.reward.drafted.push(player.id); grantItem(recipient, item);
      addLog(game, `${player.name} drafts ${item.name} for ${recipient.name}.`);
      advanceLootDraft(game);
      if (lootDraftComplete(game) && Object.values(game.reward.choices).every((choice) => choice.abilityChosen && choice.ready)) continueAfterReward(game);
      return null;
    }
    case 'passLoot':
    case 'skipItem': {
      if (game.phase !== 'reward') return 'There is no reward to skip.';
      const drafterId = currentDrafter(game);
      if (!drafterId) return 'The party loot draft is complete.';
      if (drafterId !== player.id) return `It is ${game.players.find((member) => member.id === drafterId)?.name || 'another player'}’s loot pick.`;
      if (game.reward.drafted.includes(player.id)) return 'You already took your turn in the loot draft.';
      game.reward.drafted.push(player.id);
      addLog(game, `${player.name} passes their loot pick.`);
      advanceLootDraft(game);
      if (lootDraftComplete(game) && Object.values(game.reward.choices).every((choice) => choice.abilityChosen && choice.ready)) continueAfterReward(game);
      return null;
    }
    case 'readyReward': {
      if (game.phase !== 'reward') return 'There is no reward to ready for.';
      const choice = game.reward.choices[player.id]; if (!choice?.abilityChosen) return 'Choose an ability first.';
      if (choice.subclassOptions?.length) return 'Choose a subclass first.';
      if (!lootDraftComplete(game)) return 'Wait for the party loot draft to finish.';
      choice.ready = true;
      if (lootDraftComplete(game) && Object.values(game.reward.choices).every((c) => c.abilityChosen && c.ready)) continueAfterReward(game);
      return null;
    }
    case 'consume': if (!['battle', 'escape'].includes(game.phase)) return 'Items can’t be used right now.'; return useItem(game, player, action.itemId, action.targetId);
    case 'escapeStep': {
      if (game.phase !== 'escape') return 'You can move freely once the gate is open.';
      if (player.dead || player.escaped) return 'You cannot move from this place.';
      const err = movePlayer(game, player, action.x, action.y, { effect: { move: 1 } });
      if (err) return err;
      if (player.x === game.roomState.exit.x && player.y === game.roomState.exit.y) player.escaped = false;
      return null;
    }
    case 'steal': return stealArtifact(game, player);
    case 'escape': return escape(game, player);
    default: return 'That action is not recognized.';
  }
}

module.exports = { createLobby, newPlayer, publicState, handleAction, advanceEnemyPhase, connectedCount, safeName, MAX_PLAYERS };
