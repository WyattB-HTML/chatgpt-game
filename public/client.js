(() => {
  const D = window.CrownfallData;
  const $ = (selector) => document.querySelector(selector);
  const state = { socket: null, game: null, playerId: localStorage.getItem('crownfall-player') || crypto.randomUUID(), roomCode: localStorage.getItem('crownfall-room') || '', selectedCard: null, flipped: false, stepMode: false, mobileTab: 'map', rogueAtStart: false, connected: false, toastTimer: null, tutorial: null };
  const icons = { Wizard: '✧', Weaver: '❋', Barbarian: '⚒', Ranger: '➶', Swordsman: '⚔', Knight: '⬟', Rogue: '♠', Guard: '♟', Soldier: '⚔', Archer: '➶', Horse: '♞', 'Guard Dog': '♣', Monster: '♧', Skeleton: '☠', Zombie: '♨', Beast: '♢', King: '♛', Basilisk: '◈', Cockatrice: '☗', Gryphon: '♜' };
  const names = ['The Gatehouse', 'Stable Court', 'Moon Gallery', 'Barracks', 'Old Chapel', 'Throne Hall', 'Crypt Stair', 'Bone Gallery', 'Flooded Cellar', 'Beast Pens', 'Hall of Echoes', 'Basilisk Vault'];

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function myPlayer() { return state.game?.players.find((player) => player.id === state.playerId); }
  function showToast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
  function status(online, label) { state.connected = online; const node = $('#connection'); node.classList.toggle('online', online); node.classList.toggle('offline', !online && state.socket); $('#connection-label').textContent = label; }

  function socketUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`; }
  function connect() {
    if (state.socket?.readyState === WebSocket.OPEN) return Promise.resolve(state.socket);
    if (state.connectPromise) return state.connectPromise;
    state.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(socketUrl()); state.socket = socket;
      status(false, 'Connecting');
      const timeout = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) { socket.close(); reject(new Error('Could not reach the game server.')); } }, 6000);
      socket.addEventListener('open', () => { clearTimeout(timeout); state.connectPromise = null; status(true, 'Room server live'); resolve(socket); });
      socket.addEventListener('message', (event) => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'error') { $('#entry-error').textContent = message.message; showToast(message.message); return; }
        if (message.type === 'state') {
          state.game = message.game; state.roomCode = message.game.code;
          localStorage.setItem('crownfall-player', state.playerId); localStorage.setItem('crownfall-room', state.roomCode);
          state.connected = true; status(true, 'Room server live');
          $('#entry-error').textContent = ''; $('#home-view').classList.add('hidden'); $('#game-view').classList.remove('hidden');
          render(message.connected || []);
        }
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout); state.connectPromise = null; status(false, 'Reconnecting');
        if (state.roomCode) setTimeout(() => reconnectSeat(), 1800);
      });
      socket.addEventListener('error', () => { clearTimeout(timeout); status(false, 'Connection interrupted'); reject(new Error('The room server could not be reached.')); });
    });
    return state.connectPromise;
  }

  async function send(type, body = {}) {
    try { const socket = await connect(); socket.send(JSON.stringify({ type, ...body })); }
    catch (error) { $('#entry-error').textContent = error.message; showToast(error.message); }
  }

  async function reconnectSeat() {
    if (!state.roomCode || state.socket?.readyState === WebSocket.OPEN) return;
    try { await connect(); state.socket.send(JSON.stringify({ type: 'join', code: state.roomCode, playerId: state.playerId, name: localStorage.getItem('crownfall-name') || 'Adventurer' })); }
    catch { status(false, 'Connection interrupted'); }
  }

  async function createRoom() {
    const name = $('#player-name').value.trim() || 'Adventurer';
    localStorage.setItem('crownfall-name', name);
    state.rogueAtStart = false;
    state.playerId = crypto.randomUUID(); localStorage.setItem('crownfall-player', state.playerId);
    await send('create', { playerId: state.playerId, name });
  }

  async function joinRoom(codeOverride) {
    const code = String(codeOverride || $('#join-code').value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) { $('#entry-error').textContent = 'Enter the five-letter room code.'; return; }
    const name = $('#player-name').value.trim() || localStorage.getItem('crownfall-name') || 'Adventurer';
    localStorage.setItem('crownfall-name', name);
    if (!localStorage.getItem('crownfall-player') || localStorage.getItem('crownfall-room') !== code) state.playerId = crypto.randomUUID();
    else state.playerId = localStorage.getItem('crownfall-player');
    localStorage.setItem('crownfall-player', state.playerId);
    await send('join', { code, playerId: state.playerId, name });
  }

  function act(kind, rest = {}) { return send('action', { action: { kind, ...rest } }); }

  function render(connected = []) {
    const game = state.game; if (!game) return;
    const me = myPlayer();
    const room = game.roomState;
    const isLobby = game.phase === 'lobby';
    $('#room-code').textContent = game.code;
    $('#game-title').textContent = room ? names[room.room - 1] : 'Gather the crew';
    $('#floor-name').textContent = room ? `FLOOR ${room.floor === 1 ? 'I' : 'II'}` : 'THE KEEP';
    $('#room-count').textContent = room ? `ROOM ${String(room.room).padStart(2, '0')} / 12` : `${game.players.length} / 6 SEATS`;
    $('#party-size').textContent = game.players.length;
    renderProgress(room?.room || 0);
    renderLobby(isLobby, game, me);
    renderMap(game, me);
    renderParty(game, connected, me);
    renderEnemies(game);
    renderLog(room);
    renderModifier(room);
    renderHand(game, me);
    renderReward(game, me);
    renderEscape(game, me);
    renderActions(game, me);
    renderScoreboard(game);
    applyMobileLayout(game, me);
    $('#map-label').textContent = room ? `${names[room.room - 1]} · ${game.phase === 'escape' ? 'Escape' : game.phase === 'reward' ? 'Rewards' : room.bossName ? 'Boss Fight' : 'Encounter'}` : 'Invite your crew · classes dealt at start';
    $('#game-view').dataset.roomType = room?.map?.type || 'lobby';
    $('#game-view').dataset.room = room?.room || 0;
    if (game.phase === 'victory' || game.phase === 'defeat') showEndScreen(game);
  }

  function renderProgress(roomNo) {
    $('#progress-rail').innerHTML = Array.from({ length: 12 }, (_, i) => `<span class="progress-room ${i + 1 < roomNo ? 'done' : ''} ${i + 1 === roomNo ? 'current' : ''}" title="Room ${i + 1}"></span>`).join('');
  }

  function renderLobby(show, game, me) {
    const banner = $('#lobby-banner'); banner.classList.toggle('hidden', !show);
    $('#end-turn').classList.add('hidden'); $('#steal-artifact').classList.add('hidden'); $('#escape-step').classList.add('hidden');
    $('#hand-panel').classList.toggle('hidden', show || game.phase !== 'battle');
    if (!show) return;
    const seats = game.players.length;
    const isHost = game.hostId === state.playerId;
    if (seats < 3) state.rogueAtStart = false;
    const rogueToggle = isHost ? `<label class="rogue-toggle"><span class="toggle"><input id="rogue-at-start" type="checkbox" ${state.rogueAtStart ? 'checked' : ''} ${seats < 3 ? 'disabled' : ''}><span class="toggle-track"></span><span class="toggle-knob"></span></span><span><b>Include a possible Rogue</b><small>${seats < 3 ? 'Available with 3 or more players.' : 'If dealt, the Rogue imitates an unused class.'}</small></span><span class="optional-tag">OPTIONAL · 3+</span></label>` : '';
    banner.innerHTML = `<strong>Room ${escapeHtml(game.code)}</strong> · Invite friends with the code or <button class="inline-link" id="share-lobby">copy invite link</button>. ${seats < 2 ? 'A second player is needed before the host can start.' : `${seats} players are ready.`} Classes are dealt randomly with no duplicates. ${isHost ? (state.rogueAtStart ? 'A Rogue may be dealt.' : 'Rogue mode is off.') : ''}${rogueToggle}<div class="host-controls">${isHost ? `<button class="button button-primary" id="start-run" ${seats < 2 ? 'disabled' : ''}>START THE HEIST <span>↗</span></button><span class="host-note">Your class is revealed when the run begins.</span>` : `<span class="host-note">Waiting for ${escapeHtml(game.players.find((p) => p.id === game.hostId)?.name || 'the host')} to begin.</span>`}</div>`;
    $('#start-run')?.addEventListener('click', () => act('start', { rogueEnabled: state.rogueAtStart }));
    $('#rogue-at-start')?.addEventListener('change', (event) => { state.rogueAtStart = event.target.checked; render(); });
    $('#share-lobby')?.addEventListener('click', copyInvite);
    $('.turn-caption span:last-child').textContent = game.players.length >= 2 ? 'The host can begin when ready.' : 'Waiting for another player to join.';
  }

  function visualEffect(card, me) {
    if (state.flipped && me?.className === 'Rogue' && card?.unique) {
      return ({
        attack: { damage: 2, range: 1, target: 'any' }, defense: { shield: 2, buff: 'evasion' },
        movement: { move: 2, teleport: true }, skill: { stealItem: true, range: 1, draw: 1, target: 'any' }
      })[card.category] || card.effect;
    }
    return card?.effect || {};
  }

  function statBonus(me, name) {
    return (me?.abilities || []).reduce((sum, ability) => sum + (ability.effect === name ? Number(ability.value || 1) : 0), 0)
      + (me?.items || []).reduce((sum, item) => sum + Number(item[name] || 0), 0);
  }

  function abilityBonus(me, name) {
    return (me?.abilities || []).reduce((sum, ability) => sum + (ability.effect === name ? Number(ability.value || 1) : 0), 0);
  }

  function movementReach(room, mover, steps, teleport = false) {
    const reached = new Set(), walls = new Set(room.map.walls);
    const occupied = new Set([
      ...room.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => `${enemy.x},${enemy.y}`),
      ...state.game.players.filter((player) => !player.dead && player.id !== mover.id).map((player) => `${player.x},${player.y}`)
    ]);
    const start = `${mover.x},${mover.y}`, queue = [{ x: mover.x, y: mover.y, distance: 0 }], seen = new Set([start]);
    while (queue.length) {
      const current = queue.shift();
      if (current.distance > 0) reached.add(`${current.x},${current.y}`);
      if (current.distance >= steps) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = current.x + dx, y = current.y + dy, key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= room.map.size || y >= room.map.size || seen.has(key) || walls.has(key) || occupied.has(key)) continue;
        seen.add(key); queue.push({ x, y, distance: current.distance + 1 });
      }
    }
    if (teleport) {
      for (let y = 0; y < room.map.size; y++) for (let x = 0; x < room.map.size; x++) {
        const key = `${x},${y}`;
        if (Math.max(Math.abs(x - mover.x), Math.abs(y - mover.y)) <= steps && key !== start && !walls.has(key) && !occupied.has(key)) reached.add(key);
      }
    }
    return reached;
  }

  function renderMap(game, me) {
    const room = game.roomState;
    if (!room) { $('#tile-map').innerHTML = ''; $('#map-hint').textContent = 'Your crew will appear here when the host starts.'; $('#combat-status').textContent = ''; return; }
    const walls = new Set(room.map.walls), card = me?.hand.find((held) => held.uid === state.selectedCard);
    const effect = visualEffect(card, me);
    const selectedMove = !!card && card.category === 'movement';
    let maxMove = selectedMove ? Number(effect.move || 0) + statBonus(me, 'move') + (me?.buffs?.find((buff) => buff.type === 'freeMove')?.value || 0) + (me?.className === 'Ranger' && me.played === 0 ? 1 : 0) : 0;
    if (room.modifier?.rule === 'rough_move' && selectedMove) maxMove = Math.max(1, maxMove - 1);
    const moveTiles = selectedMove && me ? movementReach(room, me, maxMove, !!(effect.teleport || effect.jump || card.id === 'rogue-shadowstep')) : new Set();
    const isAttack = !!card && (card.category === 'attack' || !!effect.damage);
    const targetRange = card ? (Number(effect.range || (effect.debuff || effect.taunt || effect.target === 'enemy' ? 4 : effect.heal || effect.target === 'ally' ? 99 : 1)) + abilityBonus(me, 'range') + (isAttack ? (me?.items || []).reduce((sum, item) => sum + Number(item.range || 0), 0) + (me?.className === 'Ranger' ? 1 : 0) + Number(room.modifier?.hero?.range || 0) : 0)) : 0;
    const targetsEnemy = !!card && (card.category === 'attack' || effect.damage || effect.debuff || effect.taunt || effect.target === 'enemy');
    const targetsAlly = !!card && !targetsEnemy && (effect.heal || effect.target === 'ally' || effect.stealItem);
    const isMovingNow = !!state.stepMode || game.phase === 'escape';
    const stepTiles = isMovingNow && me ? movementReach(room, me, state.stepMode ? 1 : 1) : new Set();
    const moveSet = selectedMove ? moveTiles : stepTiles;
    let hint = selectedMove ? `Green tiles: move up to ${maxMove} tile${maxMove === 1 ? '' : 's'}; diagonals count as 1.` : state.stepMode ? 'Choose an open tile within 1 step (diagonals count).' : targetsEnemy || targetsAlly ? `Select a highlighted target within ${targetRange} tile${targetRange === 1 ? '' : 's'}; diagonals count as 1.` : 'Choose a card, then click a highlighted tile or target.';
    if (game.phase === 'escape') hint = 'Use Move to walk toward the red gate. Diagonals count as 1 tile.';
    $('#map-hint').textContent = hint;
    const guard = me?.guard ?? 0;
    const heldMoves = me?.hand.filter((held) => held.category === 'movement').map((held) => Number(visualEffect(held, me).move || 0)).filter(Boolean) || [];
    const moveBonus = me ? statBonus(me, 'move') + (me.buffs.find((buff) => buff.type === 'freeMove')?.value || 0) + (me.className === 'Ranger' && me.played === 0 ? 1 : 0) : 0;
    const movementText = selectedMove ? `MOVE · UP TO ${maxMove}` : `MOVE · ${heldMoves.length ? `UP TO ${Math.max(...heldMoves) + moveBonus}` : 'NO MOVE CARD'}${heldMoves.length ? '' : moveBonus ? ` · BONUS +${moveBonus}` : ''}`;
    const rangeText = targetRange >= 99 ? 'RANGE · ALL TILES' : `RANGE · ${targetRange} TILES`;
    const classChip = me?.className ? `<span class="status-chip class-chip">${escapeHtml(me.subclass || me.className)}</span>` : '';
    const hpChip = me ? `<span class="status-chip hp-chip">HP <b>${me.hp}/${me.maxHp}</b></span>` : '';
    $('#combat-status').innerHTML = `${classChip}${hpChip}<span class="status-chip guard-chip">GUARD <b>${guard}</b></span><span class="status-chip">${movementText}</span>${targetsEnemy || targetsAlly ? `<span class="status-chip range-chip">${rangeText}</span>` : ''}${me ? `<span class="status-chip deck-chip">DRAW ${me.draw.length} · DISCARD ${me.discard.length}</span>` : ''}`;
    const map = [];
    for (let y = 0; y < room.map.size; y++) for (let x = 0; x < room.map.size; x++) {
      const key = `${x},${y}`, wall = walls.has(key), isExit = game.phase === 'escape' && x === room.exit.x && y === room.exit.y;
      const player = game.players.find((p) => !p.dead && p.x === x && p.y === y);
      const enemy = room.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
      const actor = player || enemy;
      const statuses = (unit) => [...(unit?.buffs || []).map((item) => ({ ...item, good: true })), ...(unit?.debuffs || []).map((item) => ({ ...item, good: false }))].slice(0, 3).map((item) => `<span class="unit-effect ${item.good ? 'good' : 'bad'}" data-tooltip="${escapeHtml(statusDescription(item.type, item.turns))}">${statusIcon(item.type)}</span>`).join('');
      let token = '';
      if (player) token = `<span class="map-token ally-token"><span class="token-emoji">${icons[player.className] || '●'}</span><span class="token-name">${escapeHtml(player.name.slice(0, 8))}</span><span class="token-vitals">${player.hp}HP · ◈${player.guard || 0}</span><span class="unit-effects">${statuses(player)}</span><span class="token-hp"><i style="width:${Math.round(player.hp / player.maxHp * 100)}%"></i></span></span>`;
      else if (enemy) token = `<span class="map-token"><span class="token-emoji">${icons[enemy.name] || '♟'}</span><span class="token-name">${escapeHtml(enemy.name.slice(0, 8))}</span><span class="token-vitals">${enemy.hp}HP · ◈${enemy.guard || 0}</span><span class="unit-effects">${statuses(enemy)}</span><span class="token-hp"><i style="width:${Math.round(enemy.hp / enemy.maxHp * 100)}%"></i></span></span>`;
      const inRange = (from, to, range) => Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= range;
      const targetEnemy = targetsEnemy && enemy && inRange(me, enemy, targetRange);
      const targetAlly = targetsAlly && player && inRange(me, player, Number(effect.range || 99) + abilityBonus(me, 'range'));
      const isMove = !wall && moveSet.has(key) && !actor;
      const inRangeZone = !!card && (targetsEnemy || targetsAlly) && !wall && !actor && inRange(me, { x, y }, targetRange);
      const terrain = room.map.terrain?.[key];
      const classes = [wall ? 'wall' : '', isExit ? 'is-exit' : '', isMove ? 'is-move-range' : '', inRangeZone ? 'is-range-zone' : '', targetEnemy ? 'is-target' : '', targetAlly ? 'is-ally-target' : '', terrain ? `terrain-${terrain}` : ''].filter(Boolean).join(' ');
      map.push(`<button class="tile ${classes}" role="gridcell" data-x="${x}" data-y="${y}" ${wall ? 'disabled' : ''} aria-label="${player ? `${escapeHtml(player.name)}, ${player.hp} HP, ${player.guard || 0} Guard` : enemy ? `${escapeHtml(enemy.name)}, ${enemy.hp} HP, ${enemy.guard || 0} Guard` : `${x + 1}, ${y + 1}${isMove ? ', reachable' : ''}${terrain ? `, ${terrain}` : ''}`}">${token}${wall && !actor ? '<span class="wall-glyph">▰</span>' : ''}${isExit && !actor ? '<span class="token-emoji exit-glyph">⌑</span>' : ''}</button>`);
    }
    $('#tile-map').innerHTML = map.join('');
    $('#tile-map').dataset.roomType = room.map.type || 'stone';
    $('#tile-map').querySelectorAll('.tile:not(.wall)').forEach((tile) => tile.addEventListener('click', () => clickTile(Number(tile.dataset.x), Number(tile.dataset.y), game, me)));
  }

  function clickTile(x, y, game, me) {
    const room = game.roomState;
    const targetPlayer = game.players.find((p) => !p.dead && p.x === x && p.y === y);
    const targetEnemy = room.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
    if (game.phase === 'escape' && state.stepMode) { act('escapeStep', { x, y }); state.stepMode = false; return; }
    const card = me?.hand.find((held) => held.uid === state.selectedCard);
    if (!card) { if (targetEnemy) showToast(`${targetEnemy.name}: ${targetEnemy.hp}/${targetEnemy.maxHp} HP. ${targetEnemy.ability}`); return; }
    if (card.category === 'movement') {
      if (card.effect.target === 'ally' && targetPlayer) act('play', { cardId: card.uid, targetId: targetPlayer.id, x, y, flipped: state.flipped });
      else act('play', { cardId: card.uid, x, y, flipped: state.flipped });
      state.selectedCard = null; state.flipped = false; return;
    }
    if (card.category === 'attack' || card.effect.damage || card.effect.debuff || card.effect.taunt) {
      const mayHitFriend = me.className === 'Rogue' && state.flipped;
      if (targetEnemy) act('play', { cardId: card.uid, targetId: targetEnemy.id, targetKind: 'enemy', flipped: state.flipped });
      else if (targetPlayer && mayHitFriend && targetPlayer.id !== me.id) act('play', { cardId: card.uid, targetId: targetPlayer.id, targetKind: 'player', flipped: state.flipped });
      else if (targetPlayer && card.effect.target === 'ally') act('play', { cardId: card.uid, targetId: targetPlayer.id, flipped: state.flipped });
      else { showToast('Choose a foe in range.'); return; }
      state.selectedCard = null; state.flipped = false; return;
    }
    if ((card.effect.heal || card.effect.target === 'ally' || (me.className === 'Rogue' && state.flipped && card.category === 'skill')) && targetPlayer) {
      act('play', { cardId: card.uid, targetId: targetPlayer.id, targetKind: 'player', flipped: state.flipped }); state.selectedCard = null; state.flipped = false; return;
    }
    showToast('Choose a valid target, or select a different card.');
  }

  function renderParty(game, connected, me) {
    const effectBadges = (player) => [...(player.buffs || []).map((effect) => ({ ...effect, good: true })), ...(player.debuffs || []).map((effect) => ({ ...effect, good: false }))].map((effect) => `<span class="status-badge ${effect.good ? 'good' : 'bad'}" data-tooltip="${escapeHtml(statusDescription(effect.type, effect.turns))}">${statusIcon(effect.type)} ${escapeHtml(effect.type)}</span>`).join('');
    $('#party-list').innerHTML = game.players.map((player) => {
      const hpWidth = Math.max(0, Math.round(player.hp / player.maxHp * 100));
      const color = D.CLASSES[player.className]?.color || '#ddd';
      const role = player.className ? `LVL ${player.level} · ${player.className === 'Rogue' ? `Rogue · ${player.subclass || player.disguiseClass + ' guise'}` : `${player.subclass ? `${player.subclass} · ` : ''}${D.CLASSES[player.className]?.role || player.className}`}` : 'Class dealt randomly at start';
      const connectedState = connected.includes(player.id) ? 'online' : '';
      return `<div class="party-member ${player.id === state.playerId ? 'current' : ''} ${player.dead ? 'fallen' : ''}"><div class="avatar" style="color:${color}">${icons[player.className] || '●'}</div><div><div class="member-name">${escapeHtml(player.name)} ${player.id === state.playerId ? '<span class="you-tag">YOU</span>' : ''}${player.id === game.hostId ? '<span class="host-tag">HOST</span>' : ''}<i class="connection-state ${connectedState}" aria-label="${connectedState ? 'Online' : 'Reconnecting'}"></i></div><div class="member-class">${escapeHtml(role)}${player.left ? ' · LEFT' : player.dead ? ' · FALLEN' : ''}</div><div class="unit-effects">${effectBadges(player)}</div></div><div class="member-hp"><span class="hp-text">${player.hp}/${player.maxHp} HP</span><div class="hp-track"><i class="${hpWidth < 35 ? 'low' : ''}" style="width:${hpWidth}%"></i></div><div class="member-guard">◈ ${player.guard || 0} guard</div></div></div>`;
    }).join('');
    const allItems = game.players.flatMap((player) => player.items.map((item) => ({ ...item, carrier: player.name, carrierId: player.id })));
    $('#party-items').innerHTML = `<div class="party-items-title">POCKETS · ${allItems.length}</div><div class="inventory">${allItems.length ? allItems.map((item) => `<button class="inventory-item ${item.kind}" data-item="${escapeHtml(item.id)}" data-owner="${escapeHtml(item.carrierId)}" data-tooltip="${escapeHtml(item.text)}">${escapeHtml(item.name)}<small>${item.kind === 'consumable' ? `${escapeHtml(item.carrier)} · USE` : `${escapeHtml(item.carrier)} · PERMANENT`}</small></button>`).join('') : '<span class="member-class">No items yet.</span>'}</div>`;
    $('#party-items').querySelectorAll('.inventory-item.consumable').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.owner !== state.playerId) { showToast('Only the carrier can use this item.'); return; }
      act('consume', { itemId: button.dataset.item });
    }));
  }

  function renderEnemies(game) {
    const enemies = game.roomState?.enemies?.filter((enemy) => enemy.hp > 0) || [];
    $('#foe-count').textContent = enemies.length ? `${enemies.length} REMAIN` : '';
    $('#foe-list').innerHTML = enemies.length ? enemies.map((enemy) => `<div class="foe-row"><div class="foe-icon">${icons[enemy.name] || '♟'}</div><div><div class="foe-name">${escapeHtml(enemy.name)}${enemy.boss ? ' · BOSS' : ''}</div><div class="foe-ability">${escapeHtml(enemy.ability)}</div>${enemy.lastCard ? `<div class="enemy-last-card">LAST · ${escapeHtml(enemy.lastCard.name)}</div>` : ''}<div class="hp-track"><i class="low" style="width:${Math.round(enemy.hp / enemy.maxHp * 100)}%"></i></div><div class="enemy-deck-count">DECK ${enemy.deckCount ?? 15} · DISCARD ${enemy.discardCount ?? 0}</div></div><div class="foe-health">${enemy.hp}<small>/${enemy.maxHp} HP</small><small>◈ ${enemy.guard || 0} Guard</small></div></div>`).join('') : `<div class="foe-empty">${game.phase === 'lobby' ? 'The hall is quiet — for now.' : game.phase === 'escape' ? 'No foes remain. Find the gate.' : 'All clear.'}</div>`;
  }

  function renderLog(room) {
    $('#event-log').innerHTML = room?.turnLog?.slice(-18).reverse().map((entry) => {
      const text = typeof entry === 'string' ? entry : entry.text, detail = typeof entry === 'string' ? '' : entry.detail;
      return `<div class="log-line ${detail ? 'has-detail' : ''}" ${detail ? `data-tooltip="${escapeHtml(detail)}" tabindex="0"` : ''}>${escapeHtml(text)}${detail ? `<small class="log-detail">${escapeHtml(detail)}</small>` : ''}</div>`;
    }).join('') || '<div class="log-line">The crew is still gathering.</div>';
  }

  function renderScoreboard(game) {
    const playerRows = game.players.map((player) => {
      const stats = player.stats || {};
      return `<tr><th>${escapeHtml(player.name)}<small>${escapeHtml(player.subclass || player.className || 'Unassigned')}</small></th><td>${stats.damageDealt || 0}</td><td>${stats.damageTaken || 0}</td><td>${stats.damageHealed || 0}</td><td>${stats.buffsGiven || 0}</td><td>${stats.debuffsGiven || 0}</td></tr>`;
    }).join('');
    const roomRows = (game.roomDurations || []).map((entry) => `<tr><th>Room ${entry.room}<small>${escapeHtml(entry.label)}</small></th><td colspan="5">${formatDuration(entry.durationMs)}</td></tr>`).join('');
    const currentRoom = game.roomState && !game.roomState.durationRecorded ? `<tr><th>Room ${game.roomState.room}<small>${names[game.roomState.room - 1]}</small></th><td colspan="5">${formatDuration(game.roomElapsedMs || 0)} · in progress</td></tr>` : '';
    $('#scoreboard').innerHTML = `<div class="score-total">OVERALL · ${formatDuration(game.elapsedMs || 0)}</div><div class="score-table-wrap"><table class="score-table"><thead><tr><th>HERO</th><th>DMG OUT</th><th>DMG IN</th><th>HEAL</th><th>BUFFS</th><th>DEBUFFS</th></tr></thead><tbody>${playerRows}</tbody></table></div><div class="score-section-label">ROOM TIMES</div><div class="score-table-wrap"><table class="score-table room-score-table"><tbody>${roomRows || ''}${currentRoom || ''}</tbody></table></div>`;
  }

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function statusIcon(type) {
    return ({ weak: '↘', root: '⌁', daze: '◌', slow: '◷', marked: '⊙', stun: '✣', fury: '⚔', evasion: '◇', taunt: '!', nextAttack: '✦', freeMove: '»', aim: '◎' })[type] || '•';
  }

  function statusDescription(type, turns = 1) {
    const meaning = { weak: 'Weak: this unit deals less damage.', root: 'Rooted: this unit cannot move.', daze: 'Dazed: this unit deals less damage.', slow: 'Slowed: this unit deals less damage.', marked: 'Marked: this unit takes extra damage.', stun: 'Stunned: this unit skips its next action.', fury: 'Fury: attacks deal extra damage.', evasion: 'Evasion: avoid one attack.', taunt: 'Taunt: nearby enemies focus this unit.', nextAttack: 'Next attack deals extra damage.', freeMove: 'Extra movement is ready.', aim: 'Aimed: the next attack hits harder.' };
    return `${meaning[type] || type}${turns ? ` · ${turns} turn${turns === 1 ? '' : 's'}` : ''}`;
  }

  function renderModifier(room) {
    const el = $('#modifier-banner');
    if (!room?.modifier) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden'); el.innerHTML = `<strong>ROOM EFFECT · ${escapeHtml(room.modifier.name)}</strong><span>✦ ${escapeHtml(room.modifier.buff)} &nbsp;·&nbsp; ⚠ ${escapeHtml(room.modifier.debuff)}</span>`;
  }

  function flippedCard(card) {
    return ({ attack: { name: 'Backstab', text: 'Deal 2 damage. Rogue may target a player.' }, defense: { name: 'Fade Away', text: 'Gain 2 guard and become hard to target.' }, movement: { name: 'Shadowstep', text: 'Dash 2 tiles through walls.' }, skill: { name: 'Lift Purse', text: 'Steal a consumable from an adjacent player or draw a card.' } })[card.category] || { name: 'Lift Purse', text: 'Steal a consumable or draw a card.' };
  }

  function cardTooltip(card, effect) {
    if (card.category === 'movement' || effect.move && !effect.damage && !effect.heal && !effect.shield) return '';
    const terms = [];
    if (effect.damage) terms.push('Damage lowers HP; Guard absorbs it first.');
    if (effect.shield) terms.push('Guard blocks damage before HP.');
    if (effect.heal) terms.push('Heal restores HP.');
    if (effect.draw) terms.push('Draw a card and gain another play.');
    if (effect.debuff === 'weak' || effect.debuff === 'daze') terms.push('Weak: deal less damage.');
    if (effect.debuff === 'root') terms.push('Root: cannot move.');
    if (effect.debuff === 'marked') terms.push('Marked: takes extra damage.');
    if (effect.buff === 'fury') terms.push('Fury: your attacks hit harder.');
    if (effect.cleanse) terms.push('Cleanse removes a harmful effect.');
    return terms.slice(0, 2).join(' ');
  }

  function renderHand(game, me) {
    const panel = $('#hand-panel');
    if (!me || game.phase !== 'battle') { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    $('#hand-count').textContent = `${me.hand.length} / ${me.handSize || 3}`;
    $('#deck-count').textContent = `Draw ${me.draw.length} · Discard ${me.discard.length}${me.draw.length === 0 && me.discard.length ? ' · reshuffles on draw' : ''}`;
    const playLimit = Number(me.playLimit || 2);
    $('#hand-rule').textContent = `${Math.max(0, playLimit - me.played)} PLAYS LEFT · DISCARD USES A PLAY`;
    $('#hand-cards').innerHTML = me.hand.length ? me.hand.map((card) => {
      const selected = state.selectedCard === card.uid;
      const flip = me.className === 'Rogue' && card.unique;
      const variant = state.flipped && selected && flip ? flippedCard(card) : null;
      const effect = variant ? visualEffect(card, me) : card.effect;
      const quickHelp = cardTooltip(card, effect);
      const locked = me.ended || me.played >= playLimit;
      const tip = quickHelp ? `data-tooltip="${escapeHtml(quickHelp)}"` : '';
      return `<div class="card-slot"><button class="card ${card.category} ${selected ? 'selected' : ''} ${variant ? 'flipped' : ''}" data-card="${card.uid}" ${tip}><span class="card-name">${escapeHtml(variant?.name || card.name)}</span><span class="card-category">${escapeHtml(card.category)}${card.upgraded ? ' · EVOLVED' : ''}</span><span class="card-text">${escapeHtml(variant?.text || card.text)}</span><span class="card-bottom"><span></span><span class="card-pips">${Array.from({ length: Math.max(1, card.category === 'attack' ? card.effect.damage || 1 : card.category === 'defense' ? card.effect.shield || 1 : card.category === 'movement' ? card.effect.move || 1 : 1) }).slice(0, 4).map(() => '<i></i>').join('')}</span></span>${flip ? `<span class="flip-mark" data-flip="${card.uid}">${variant ? 'UNFLIP' : 'FLIP'}</span>` : ''}</button><button class="discard-card" data-discard="${card.uid}" ${locked ? 'disabled' : ''}>DISCARD · USE A PLAY</button></div>`;
    }).join('') : '<div class="empty-hand">Your hand is empty. When the draw pile runs out, your discard is shuffled back in.</div>';
    $('#hand-cards').querySelectorAll('.card').forEach((node) => node.addEventListener('click', (event) => {
      const card = me.hand.find((held) => held.uid === node.dataset.card); if (!card) return;
      if (me.ended) { showToast('Your turn is already ended.'); return; }
      if (event.target.dataset.flip) { if (state.selectedCard !== card.uid) { state.selectedCard = card.uid; state.flipped = true; } else state.flipped = !state.flipped; state.mobileTab = 'map'; render(); return; }
      if (state.selectedCard === card.uid) { state.selectedCard = null; state.flipped = false; render(); return; }
      state.selectedCard = card.uid; state.flipped = false;
      const targetRequired = card.category === 'movement' || card.category === 'attack' || card.effect.damage || card.effect.debuff || card.effect.taunt || card.effect.heal || card.effect.target === 'ally' || (me.className === 'Rogue' && state.flipped && card.category === 'skill');
      if (!targetRequired) { act('play', { cardId: card.uid }); state.selectedCard = null; }
      else state.mobileTab = 'map';
      render();
    }));
    $('#hand-cards').querySelectorAll('.discard-card').forEach((button) => button.addEventListener('click', () => { act('discardCard', { cardId: button.dataset.discard }); state.selectedCard = null; state.flipped = false; }));
  }

  function renderReward(game, me) {
    const panel = $('#reward-panel');
    if (game.phase !== 'reward' || !me || !game.reward) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    const choice = game.reward.choices[me.id];
    if (!choice) { panel.innerHTML = '<p>Reward choices unavailable. Reconnect to continue.</p>'; return; }
    const subclassPrompt = choice.subclassOptions?.length;
    const drafterId = game.reward.draftOrder?.[game.reward.draftIndex] || null;
    const drafter = game.players.find((player) => player.id === drafterId);
    const canDraft = drafterId === me.id;
    const lootComplete = game.reward.items.every((item) => !!item.claimedBy);
    const myAbility = me.abilities.at(-1);
    let abilityMarkup = '';
    if (choice.abilityChosen) abilityMarkup = `<div class="reward-choice">✦ You chose <strong>${escapeHtml(myAbility?.name || 'an ability')}</strong>. ${escapeHtml(myAbility?.text || '')}</div>`;
    else abilityMarkup = `<div class="reward-options">${choice.abilityOptions.map((offer) => `<button class="reward-option" data-ability="${escapeHtml(offer.id)}"><b>${escapeHtml(offer.name)}</b><p>${escapeHtml(offer.text)}</p></button>`).join('')}</div>`;
    const subclassMarkup = subclassPrompt ? `<div class="reward-section-title">ROOM 6 · CHOOSE YOUR PATH</div><div class="reward-options">${choice.subclassOptions.map((name) => `<button class="reward-option subclass-option" data-subclass="${escapeHtml(name)}"><b>${escapeHtml(name)}</b><p>${escapeHtml(subclassText(name))}</p></button>`).join('')}</div>` : '';
    const offers = game.reward.items.map((item) => {
      const done = !!item.claimedBy;
      const recipient = item.claimedBy === 'left' ? null : game.players.find((player) => player.id === item.claimedBy);
      const picker = game.players.find((player) => player.id === item.pickedBy);
      const status = item.claimedBy === 'left' ? 'LEFT IN THE KEEP' : recipient ? `FOR ${escapeHtml(recipient.name)} · PICKED BY ${escapeHtml(picker?.name || 'THE CREW')}` : drafter ? `AVAILABLE ON ${escapeHtml(drafter.name)}’S PICK` : 'NO PICK LEFT';
      const recipients = game.players.filter((player) => !player.dead).map((player) => `<option value="${escapeHtml(player.id)}" ${player.id === me.id ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('');
      return `<div class="reward-item ${done ? 'claimed' : ''}"><b>${escapeHtml(item.name)}</b><p>${escapeHtml(item.text)}</p><span class="member-class">${status}</span>${!done && canDraft ? `<div class="reward-item-actions"><select class="recipient-select" data-recipient="${item.slot}" aria-label="Who gets ${escapeHtml(item.name)}">${recipients}</select><button data-claim="${item.slot}">ASSIGN ITEM</button></div>` : ''}</div>`;
    }).join('');
    const ready = choice.ready;
    const draftStatus = lootComplete ? 'The loot draft is complete.' : canDraft ? 'It is your turn. Choose an item and assign it to any living hero, or pass.' : drafter ? `${escapeHtml(drafter.name)} is choosing who gets the next item.` : 'No more loot picks remain.';
    panel.innerHTML = `<div class="reward-title">Room ${game.roomState.room} cleared.</div><p class="reward-subtitle">Choose a passive, then share the item draft. ${draftStatus}</p>${subclassMarkup}<div class="reward-section-title">YOUR NEW ABILITY</div>${abilityMarkup}<div class="reward-section-title">ROTATING LOOT DRAFT · ${game.reward.items.length} ITEMS</div><div class="draft-order">${(game.reward.draftOrder || []).map((id, index) => `<span class="draft-player ${id === drafterId ? 'current-drafter' : ''}">${index + 1}. ${escapeHtml(game.players.find((player) => player.id === id)?.name || 'Hero')}</span>`).join('')}</div><div class="reward-items">${offers || '<span class="member-class">No items this room.</span>'}</div><div class="reward-footer"><p>${ready ? 'You are ready. Waiting for the rest of the crew.' : 'Your class deck and passives stay with you between rooms.'}</p><div class="reward-footer-actions">${canDraft ? '<button id="pass-loot" class="button button-quiet">PASS PICK</button>' : ''}<button id="ready-reward" class="button button-primary" ${!choice.abilityChosen || subclassPrompt || ready || !lootComplete ? 'disabled' : ''}>${ready ? 'READY' : 'READY FOR NEXT ROOM'} <span>↗</span></button></div></div>`;
    panel.querySelectorAll('[data-ability]').forEach((button) => button.addEventListener('click', () => act('chooseAbility', { abilityId: button.dataset.ability })));
    panel.querySelectorAll('[data-subclass]').forEach((button) => button.addEventListener('click', () => act('chooseSubclass', { subclass: button.dataset.subclass })));
    panel.querySelectorAll('[data-claim]').forEach((button) => button.addEventListener('click', () => {
      const slot = Number(button.dataset.claim);
      const recipientId = panel.querySelector(`[data-recipient="${slot}"]`)?.value;
      act('claimItem', { slot, recipientId });
    }));
    $('#pass-loot')?.addEventListener('click', () => act('passLoot'));
    $('#ready-reward')?.addEventListener('click', () => act('readyReward'));
  }

  function subclassText(name) {
    const text = { Archmage: 'Turn wide spells into devastating room control.', Arcanist: 'Lean into tricks, utility, and a larger hand.', Mender: 'Make healing and protection reach further.', Hexweaver: 'Let curses spread and drain the castle.', Warlord: 'Hold the line and rally everyone around you.', Reaver: 'Turn sweeping attacks into stolen life.', Deadeye: 'Make each precise shot count.', Windstalker: 'Move freely and leave enemies tangled.', Duelist: 'Commit to one foe and win the exchange.', 'Bounty Hunter': 'Isolate a target and cut off escape.', Sentinel: 'Protect the crew with heavier guard.', Justiciar: 'Turn shield shoves into punishment.', Assassin: 'Strike first from the shadows.', Thief: 'Slip past the guards and make the relic yours.' };
    return text[name] || 'Evolve your unique cards toward a sharper focus.';
  }

  function renderEscape(game, me) {
    const panel = $('#escape-panel');
    if (game.phase !== 'escape' || !me) { panel.classList.add('hidden'); panel.innerHTML = ''; $('#escape-step').classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const escaped = me.escaped;
    const exit = game.roomState.exit;
    const distance = Math.max(Math.abs(me.x - exit.x), Math.abs(me.y - exit.y));
    panel.innerHTML = `<div class="panel-kicker">FINAL ROOM · GET OUT</div><h2>${me.artifact ? 'The relic is in your hands.' : 'The vault is behind you.'}</h2><p>${me.className === 'Rogue' && me.artifact ? 'Make it to the gate alone to win the heist.' : 'Move one tile at a time. Any living crew member can reach the gate to carry the crew’s escape.'}</p><div class="escape-status">${escaped ? 'YOU ARE THROUGH THE GATE.' : distance === 0 ? 'YOU ARE ON THE GATE. Claim the escape.' : `${distance} TILE${distance === 1 ? '' : 'S'} TO THE RED GATE.`}</div>${distance === 0 && !escaped ? '<button class="button button-primary" id="claim-escape">ESCAPE WITH THE RELIC ↗</button>' : ''}`;
    $('#claim-escape')?.addEventListener('click', () => act('escape'));
    $('#escape-step').classList.toggle('hidden', escaped);
  }

  function applyMobileLayout(game) {
    const compact = matchMedia('(max-width: 1000px)').matches;
    const sideTabs = ['party', 'foes', 'log', 'score'];
    if (compact) {
      if (game.phase === 'reward') state.mobileTab = 'hand';
      else if (game.phase === 'escape') state.mobileTab = 'map';
      else if (game.phase === 'victory' || game.phase === 'defeat') state.mobileTab = 'score';
      document.querySelectorAll('[data-mobile-pane]').forEach((node) => node.classList.toggle('mobile-pane-hidden', node.dataset.mobilePane !== state.mobileTab));
    } else {
      if (!sideTabs.includes(state.mobileTab)) state.mobileTab = 'foes';
      document.querySelectorAll('[data-mobile-pane]').forEach((node) => {
        const pane = node.dataset.mobilePane;
        const pinned = pane === 'map' || pane === 'hand' && game.phase === 'battle';
        node.classList.toggle('mobile-pane-hidden', !(pinned || pane === state.mobileTab || pane === 'hand' && game.phase === 'reward'));
      });
    }
    document.querySelectorAll('[data-mobile-tab]').forEach((button) => button.classList.toggle('active', button.dataset.mobileTab === state.mobileTab));
  }

  function renderActions(game, me) {
    if (!me || game.phase !== 'battle') { $('#end-turn').classList.add('hidden'); $('#steal-artifact').classList.add('hidden'); }
    else {
      const end = $('#end-turn'); end.classList.remove('hidden'); end.disabled = me.ended || me.dead;
      end.textContent = me.ended ? 'WAITING FOR CREW' : 'END TURN ↗';
      const active = game.players.filter((player) => !player.dead && !player.ended).map((player) => player.name);
      const caption = me.dead ? 'You have fallen.' : me.ended ? active.length ? `Waiting for ${active.join(', ')} to end turn.` : 'Enemies draw and act immediately.' : `${Math.max(0, Number(me.playLimit || 2) - me.played)} card plays left this turn`;
      $('.turn-caption span:last-child').textContent = caption;
      $('.turn-caption').classList.toggle('waiting', me.ended || me.dead);
      const canSteal = me.className === 'Rogue' && game.roomState.room === 12 && game.roomState.artifact === 'sealed';
      $('#steal-artifact').classList.toggle('hidden', !canSteal); $('#steal-artifact').disabled = !canSteal;
    }
    if (game.phase === 'escape' && me && !me.escaped) $('#escape-step').classList.remove('hidden');
    $('#end-turn').onclick = () => act('end');
    $('#steal-artifact').onclick = () => act('steal');
    $('#escape-step').onclick = () => { state.stepMode = true; state.selectedCard = null; render(); };
  }

  function showEndScreen(game) {
    $('#reward-panel').classList.remove('hidden'); $('#hand-panel').classList.add('hidden');
    const victory = game.phase === 'victory';
    const wonByRogue = game.winner === 'Rogue';
    $('#reward-panel').innerHTML = `<div class="end-screen"><div class="seal">${victory ? (wonByRogue ? '♠' : '✦') : '☠'}</div><h2>${victory ? wonByRogue ? 'A quieter kind of crown.' : 'The crew made it out.' : 'The keep keeps its secret.'}</h2><p>${victory ? wonByRogue ? 'The Rogue slipped away with the relic. The castle wakes to an empty vault.' : 'Twelve rooms behind you. The artifact is safe in the crew’s hands.' : 'The party has fallen before the relic reached the gate.'}</p><button class="button button-quiet" onclick="localStorage.removeItem('crownfall-room');location.href='/'">RETURN TO THE KEEP ↗</button></div>`;
  }

  function startTutorial() {
    state.tutorial = { room: 1, step: 0, selected: null, player: { x: 1, y: 3, hp: 8, maxHp: 8, guard: 0 }, ally: { x: 1, y: 4, hp: 10, maxHp: 10, guard: 0 }, enemy: { x: 3, y: 3, hp: 2, maxHp: 2, name: 'Castle Guard' }, played: 0, playLimit: 2, hand: [{ id: 'stride', name: 'Stride', category: 'movement', text: 'Move up to 2 tiles.', move: 2 }, { id: 'strike', name: 'Basic Strike', category: 'attack', text: 'Deal 1 damage. Range 1.', damage: 1 }, { id: 'block', name: 'Block', category: 'defense', text: 'Gain 1 Guard.', guard: 1 }], discard: 0, log: ['Mara joined the training crew.'], done: false };
    $('#home-view').classList.add('hidden'); $('#game-view').classList.add('hidden'); $('#tutorial-view').classList.remove('hidden');
    renderTutorial();
  }

  function advanceTutorialRoom() {
    const t = state.tutorial;
    Object.assign(t, { room: 2, step: 0, selected: null, player: { x: 1, y: 3, hp: 8, maxHp: 8, guard: 0 }, ally: { x: 1, y: 4, hp: 10, maxHp: 10, guard: 0 }, enemy: { x: 4, y: 3, hp: 4, maxHp: 4, name: 'Skeleton' }, played: 0, playLimit: 2, hand: [{ id: 'block', name: 'Block', category: 'defense', text: 'Gain 2 Guard.', guard: 2 }, { id: 'quick-shot', name: 'Quick Shot', category: 'attack', text: 'Deal 1 damage. Range 4.', damage: 1 }, { id: 'stride', name: 'Stride', category: 'movement', text: 'Move up to 2 tiles.', move: 2 }], discard: t.discard + 2, log: [...t.log, 'Room 1 clear. Mara finishes the guard with Quick Shot.', 'You kept the cards you did not use. Used cards moved to discard.'] });
    renderTutorial();
  }

  function tutorialCard(id) { return state.tutorial?.hand.find((card) => card.id === id); }
  function tutorialPlay(id) {
    const t = state.tutorial, card = tutorialCard(id);
    if (!card || t.played >= t.playLimit) return;
    t.selected = card.id;
    if (t.room === 1 && t.step === 0 && card.id === 'stride') { renderTutorial(); return; }
    if (t.room === 1 && t.step === 1 && card.id === 'strike') { renderTutorial(); return; }
    if (t.room === 2 && t.step === 0 && card.id === 'block') {
      t.player.guard += card.guard; t.played++; t.discard++; t.hand = t.hand.filter((item) => item !== card); t.step = 1;
      t.log.push('You played Block and gained 2 Guard.'); renderTutorial(); return;
    }
    if (t.room === 2 && t.step === 2 && card.id === 'stride') { renderTutorial(); return; }
    if (t.room === 2 && t.step === 3 && card.id === 'heavy-strike') { renderTutorial(); return; }
    showToast('Try the highlighted card for this lesson.');
  }

  function tutorialTile(x, y) {
    const t = state.tutorial, stepCard = t.hand.find((card) => card.id === t.selected);
    if (!stepCard) return;
    const distance = Math.max(Math.abs(x - t.player.x), Math.abs(y - t.player.y));
    if (stepCard.move && ((t.room === 1 && t.step === 0) || (t.room === 2 && t.step === 2))) {
      if (distance < 1 || distance > stepCard.move || x === 2 && y === 2) { showToast('Choose a green open tile.'); return; }
      if (Math.max(Math.abs(x - t.enemy.x), Math.abs(y - t.enemy.y)) > 1) { showToast('End beside the foe so you can strike next.'); return; }
      t.player.x = x; t.player.y = y; t.played++; t.discard++; t.hand = t.hand.filter((card) => card !== stepCard); t.selected = null;
      t.log.push(`You play ${stepCard.name} to move ${distance} tile${distance === 1 ? '' : 's'}.`);
      t.step++;
      renderTutorial(); return;
    }
    if (x === t.enemy.x && y === t.enemy.y && distance <= (stepCard.range || 1) && stepCard.damage) {
      t.enemy.hp = Math.max(0, t.enemy.hp - stepCard.damage); t.played++; t.discard++; t.hand = t.hand.filter((card) => card !== stepCard); t.selected = null;
      t.log.push(`You play ${stepCard.name} for ${stepCard.damage} damage.`);
      if (t.room === 1 && t.enemy.hp > 0) {
        t.enemy.hp = Math.max(0, t.enemy.hp - 1); t.log.push('Computer ally Mara plays Quick Shot for 1 damage. Castle Guard falls.'); t.step = 2;
      } else if (t.room === 2 && t.enemy.hp <= 0) {
        t.log.push('Skeleton falls. Room 2 is clear.'); t.step = 4;
      }
      renderTutorial(); return;
    }
    showToast('Choose the enemy in range, or a highlighted move tile.');
  }

  function tutorialEndTurn() {
    const t = state.tutorial;
    if (t.room !== 2 || t.step !== 1) return;
    t.log.push('Computer ally Mara plays Quick Shot for 1 damage.'); t.enemy.hp = Math.max(0, t.enemy.hp - 1);
    const blocked = Math.min(t.player.guard, 2); t.player.guard -= blocked;
    const hit = 2 - blocked; t.player.hp = Math.max(1, t.player.hp - hit);
    t.log.push(`Skeleton draws Bone Shot and deals 2 damage. Your Guard blocks ${blocked}; you lose ${hit} HP.`);
    t.hand = [{ id: 'stride', name: 'Stride', category: 'movement', text: 'Move up to 2 tiles.', move: 2 }, { id: 'heavy-strike', name: 'Heavy Strike', category: 'attack', text: 'Deal 3 damage. Range 1.', damage: 3, range: 1 }];
    t.played = 0; t.playLimit = 2; t.step = 2; t.log.push('New turn: your hand refills and your two plays return.'); renderTutorial();
  }

  function renderTutorial() {
    const t = state.tutorial; if (!t) return;
    const roomName = t.room === 1 ? 'Gatehouse' : 'Bone Gallery';
    $('#tutorial-title').textContent = `Room ${t.room} · ${roomName}`;
    $('#tutorial-step').textContent = t.room === 1 ? `LESSON 1 OF 2 · ${['MOVE ON THE GRID', 'ATTACK WITH A CARD', 'ROOM CLEAR'][t.step] || 'ROOM CLEAR'}` : `LESSON 2 OF 2 · ${['GUARD & ENEMY TURNS', 'THE FOES TAKE THEIR TURN', 'MOVE INTO RANGE', 'FINISH THE FIGHT', 'TUTORIAL COMPLETE'][t.step] || 'TUTORIAL COMPLETE'}`;
    const guides = t.room === 1 ? [
      'Pick Stride, then click a green tile. Diagonals count as one tile.',
      'Pick Basic Strike, then click the nearby guard. Mara is a computer-controlled ally; she will help finish the fight.',
      'Good work. Cards you play go to your discard, and your ally acted without waiting for you. Continue to room two.'
    ] : [
      'Play Block to gain Guard. Guard absorbs hits before HP.',
      'End your turn. Mara will shoot, then the Skeleton draws a card and attacks right away.',
      'The enemy turn is over. Pick Stride and move to a green tile within striking distance.',
      'Play Heavy Strike against the Skeleton to clear this room.',
      'You completed both rooms. You can start a private multiplayer room from the home screen.'
    ];
    const guide = guides[t.step] || guides[guides.length - 1];
    $('#tutorial-guide').innerHTML = `<div class="panel-kicker">FIELD LESSON</div><h2>${escapeHtml(guide.split('.')[0])}</h2><p>${escapeHtml(guide)}</p><div class="tutorial-vitals"><span>RANGER · ${t.player.hp}/${t.player.maxHp} HP</span><span>◈ ${t.player.guard} GUARD</span><span>${Math.max(0, t.playLimit - t.played)} PLAYS LEFT</span></div>${t.step === 1 && t.room === 2 ? '<button id="tutorial-end-turn" class="button button-primary">END TURN · LET THEM ACT</button>' : ''}${t.step === 2 && t.room === 1 ? '<button id="tutorial-next-room" class="button button-primary">ENTER ROOM TWO ↗</button>' : ''}${t.step === 4 && t.room === 2 ? '<button id="tutorial-home" class="button button-primary">RETURN TO THE KEEP ↗</button>' : ''}`;
    const stepCard = t.hand.find((card) => card.id === t.selected);
    const occupied = new Set([`${t.player.x},${t.player.y}`, `${t.ally.x},${t.ally.y}`, `${t.enemy.x},${t.enemy.y}`]);
    const walls = new Set(t.room === 1 ? ['2,2'] : ['2,2', '5,4']);
    const map = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const key = `${x},${y}`, isPlayer = t.player.x === x && t.player.y === y, isAlly = t.ally.x === x && t.ally.y === y, isEnemy = t.enemy.hp > 0 && t.enemy.x === x && t.enemy.y === y;
      const distance = Math.max(Math.abs(x - t.player.x), Math.abs(y - t.player.y));
      const moving = stepCard?.move && distance > 0 && distance <= stepCard.move && Math.max(Math.abs(x - t.enemy.x), Math.abs(y - t.enemy.y)) <= 1 && !occupied.has(key) && !walls.has(key);
      const target = stepCard?.damage && isEnemy && distance <= (stepCard.range || 1);
      const token = isPlayer ? `<span class="map-token ally-token"><span class="token-emoji">➶</span><span class="token-name">YOU</span><span class="token-vitals">${t.player.hp}HP · ◈${t.player.guard}</span></span>` : isAlly ? '<span class="map-token ally-token"><span class="token-emoji">⬟</span><span class="token-name">MARA</span></span>' : isEnemy ? `<span class="map-token"><span class="token-emoji">${t.room === 1 ? '♟' : '☠'}</span><span class="token-name">${escapeHtml(t.enemy.name)}</span><span class="token-vitals">${t.enemy.hp}HP</span></span>` : '';
      map.push(`<button class="tile ${walls.has(key) ? 'wall' : ''} ${moving ? 'is-move-range' : ''} ${target ? 'is-target' : ''}" data-tutorial-x="${x}" data-tutorial-y="${y}" ${walls.has(key) ? 'disabled' : ''} aria-label="${isPlayer ? 'You' : isAlly ? 'Computer ally Mara' : isEnemy ? `${t.enemy.name} ${t.enemy.hp} HP` : `${x + 1}, ${y + 1}`}">${token}${walls.has(key) ? '<span class="wall-glyph">▰</span>' : ''}</button>`);
    }
    $('#tutorial-map').innerHTML = map.join('');
    $('#tutorial-map').querySelectorAll('[data-tutorial-x]').forEach((tile) => tile.addEventListener('click', () => tutorialTile(Number(tile.dataset.tutorialX), Number(tile.dataset.tutorialY))));
    $('#tutorial-hand').innerHTML = t.hand.map((card) => `<button class="tutorial-card ${card.category} ${card.id === t.selected ? 'selected' : ''}" data-tutorial-card="${card.id}" ${card.category === 'movement' ? '' : `data-tooltip="${escapeHtml(card.damage ? 'Damage lowers HP; Guard absorbs it first.' : card.guard ? 'Guard blocks damage before HP.' : '')}"`}><b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.category)}</small><span>${escapeHtml(card.text)}</span></button>`).join('') || '<div class="empty-hand">Your hand is empty.</div>';
    $('#tutorial-hand').querySelectorAll('[data-tutorial-card]').forEach((button) => button.addEventListener('click', () => tutorialPlay(button.dataset.tutorialCard)));
    $('#tutorial-action').innerHTML = stepCard?.move ? '<p class="map-hint">Green tiles are within movement range.</p>' : stepCard?.damage ? '<p class="map-hint">Select a foe highlighted in blue.</p>' : '';
    $('#tutorial-log').innerHTML = `<div class="panel-kicker">CREW LOG</div>${t.log.slice(-6).reverse().map((line) => `<p>${escapeHtml(line)}</p>`).join('')}`;
    $('#tutorial-ally').innerHTML = '<div class="panel-kicker">COMPUTER ALLY</div><strong>Mara · Knight</strong><p>She takes a useful shot after your first attack, and acts before enemies on a full turn.</p>';
    $('#tutorial-end-turn')?.addEventListener('click', tutorialEndTurn);
    $('#tutorial-next-room')?.addEventListener('click', advanceTutorialRoom);
    $('#tutorial-home')?.addEventListener('click', exitTutorial);
  }

  function exitTutorial() {
    state.tutorial = null; $('#tutorial-view').classList.add('hidden'); $('#home-view').classList.remove('hidden');
  }

  function leaveGame() {
    const socket = state.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'leave' }));
      socket.close();
    }
    state.socket = null; state.game = null; state.roomCode = ''; state.playerId = crypto.randomUUID();
    state.selectedCard = null; state.flipped = false; state.stepMode = false;
    localStorage.removeItem('crownfall-room'); localStorage.removeItem('crownfall-player');
    $('#game-view').classList.add('hidden'); $('#tutorial-view').classList.add('hidden'); $('#home-view').classList.remove('hidden');
    history.replaceState({}, '', location.pathname);
    status(false, 'Not in a room');
  }

  async function copyInvite() {
    const url = `${location.origin}${location.pathname}?room=${state.roomCode}`;
    try { await navigator.clipboard.writeText(url); showToast('Invite link copied. Send it to your crew.'); }
    catch { showToast(`Room code ${state.roomCode} — share it with your crew.`); }
  }

  function openRules() { $('#rules').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeRules() { $('#rules').classList.add('hidden'); document.body.style.overflow = ''; }

  document.querySelectorAll('[data-mobile-tab]').forEach((button) => button.addEventListener('click', () => { state.mobileTab = button.dataset.mobileTab; render(); }));
  window.addEventListener('resize', () => { if (state.game) applyMobileLayout(state.game); });
  $('#create-room').addEventListener('click', createRoom);
  $('#tutorial-btn').addEventListener('click', startTutorial);
  $('#tutorial-exit').addEventListener('click', exitTutorial);
  $('#join-room').addEventListener('click', () => joinRoom());
  $('#join-code').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
  $('#join-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
  $('#copy-code').addEventListener('click', copyInvite);
  $('#leave-game').addEventListener('click', leaveGame);
  $('#open-rules').addEventListener('click', openRules);
  document.querySelectorAll('[data-close-rules]').forEach((node) => node.addEventListener('click', closeRules));
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeRules(); });
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) { $('#join-code').value = invite.toUpperCase(); setTimeout(() => $('#player-name').focus(), 200); }
  if (state.roomCode && state.roomCode === invite?.toUpperCase() && localStorage.getItem('crownfall-player')) reconnectSeat();
  else if (!invite && state.roomCode && localStorage.getItem('crownfall-player')) reconnectSeat();
})();
