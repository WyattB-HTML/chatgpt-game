(() => {
  const D = window.CrownfallData;
  const $ = (selector) => document.querySelector(selector);
  const state = { socket: null, game: null, playerId: localStorage.getItem('crownfall-player') || crypto.randomUUID(), roomCode: localStorage.getItem('crownfall-room') || '', selectedCard: null, flipped: false, stepMode: false, mobileTab: 'map', rogueAtStart: false, connected: false, toastTimer: null };
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
    renderReaction(game, me);
    applyMobileLayout(game, me);
    $('#map-label').textContent = room ? `${names[room.room - 1]} · ${game.phase === 'escape' ? 'Escape' : game.phase === 'reward' ? 'Rewards' : 'Fight'}` : 'Invite your crew · classes dealt at start';
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
    const effect = visualEffect(card, me), turn = room.enemyTurn, prompt = room.reactionPrompt;
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
    if (turn) hint = prompt ? `${prompt.playerId === state.playerId ? 'Your reaction is open.' : `${prompt.targetName} is choosing a reaction.`} The enemy turn is paused.` : 'Enemy turn in progress; actions resolve one at a time.';
    $('#map-hint').textContent = hint;
    const guard = me?.guard ?? 0;
    const heldMoves = me?.hand.filter((held) => held.category === 'movement').map((held) => Number(visualEffect(held, me).move || 0)).filter(Boolean) || [];
    const moveBonus = me ? statBonus(me, 'move') + (me.buffs.find((buff) => buff.type === 'freeMove')?.value || 0) + (me.className === 'Ranger' && me.played === 0 ? 1 : 0) : 0;
    const movementText = selectedMove ? `MOVE · UP TO ${maxMove}` : `MOVE · ${heldMoves.length ? `UP TO ${Math.max(...heldMoves) + moveBonus}` : 'NO MOVE CARD'}${heldMoves.length ? '' : moveBonus ? ` · BONUS +${moveBonus}` : ''}`;
    const rangeText = targetRange >= 99 ? 'RANGE · ALL TILES' : `RANGE · ${targetRange} TILES`;
    $('#combat-status').innerHTML = `<span class="status-chip guard-chip">GUARD <b>${guard}</b></span><span class="status-chip">${movementText}</span>${targetsEnemy || targetsAlly ? `<span class="status-chip range-chip">${rangeText}</span>` : ''}${me ? `<span class="status-chip deck-chip">DRAW ${me.draw.length} · DISCARD ${me.discard.length}</span>` : ''}`;
    const map = [];
    for (let y = 0; y < room.map.size; y++) for (let x = 0; x < room.map.size; x++) {
      const key = `${x},${y}`, wall = walls.has(key), isExit = game.phase === 'escape' && x === room.exit.x && y === room.exit.y;
      const player = game.players.find((p) => !p.dead && p.x === x && p.y === y);
      const enemy = room.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
      const actor = player || enemy;
      let token = '';
      if (player) token = `<span class="map-token ally-token"><span class="token-emoji">${icons[player.className] || '●'}</span><span class="token-name">${escapeHtml(player.name.slice(0, 8))}</span><span class="token-hp"><i style="width:${Math.round(player.hp / player.maxHp * 100)}%"></i></span></span>`;
      else if (enemy) token = `<span class="map-token"><span class="token-emoji">${icons[enemy.name] || '♟'}</span><span class="token-name">${escapeHtml(enemy.name.slice(0, 8))}</span><span class="token-hp"><i style="width:${Math.round(enemy.hp / enemy.maxHp * 100)}%"></i></span></span>`;
      const inRange = (from, to, range) => Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= range;
      const targetEnemy = targetsEnemy && enemy && inRange(me, enemy, targetRange);
      const targetAlly = targetsAlly && player && inRange(me, player, Number(effect.range || 99) + abilityBonus(me, 'range'));
      const isMove = !wall && moveSet.has(key) && !actor;
      const inRangeZone = !!card && (targetsEnemy || targetsAlly) && !wall && !actor && inRange(me, { x, y }, targetRange);
      const isActiveEnemy = turn?.currentEnemyId === enemy?.id;
      const isThreatTarget = turn?.targetId === player?.id;
      const classes = [wall ? 'wall' : '', isExit ? 'is-exit' : '', isMove ? 'is-move-range' : '', inRangeZone ? 'is-range-zone' : '', targetEnemy ? 'is-target' : '', targetAlly ? 'is-ally-target' : '', isActiveEnemy ? 'enemy-active' : '', isThreatTarget ? 'enemy-threatened' : ''].filter(Boolean).join(' ');
      const title = `${x + 1}, ${y + 1}${player ? ` · ${escapeHtml(player.name)} · Guard ${player.guard}` : ''}${enemy ? ` · ${escapeHtml(enemy.name)} ${enemy.hp}/${enemy.maxHp} HP` : ''}${isMove ? ' · Move here' : ''}${targetEnemy || targetAlly ? ' · In range' : ''}`;
      map.push(`<button class="tile ${classes}" role="gridcell" data-x="${x}" data-y="${y}" ${wall ? 'disabled' : ''} title="${title}">${token}${wall && !actor ? '<span class="wall-glyph">▰</span>' : ''}${isExit && !actor ? '<span class="token-emoji exit-glyph">⌑</span>' : ''}</button>`);
    }
    $('#tile-map').innerHTML = map.join('');
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
    $('#party-list').innerHTML = game.players.map((player) => {
      const hpWidth = Math.max(0, Math.round(player.hp / player.maxHp * 100));
      const color = D.CLASSES[player.className]?.color || '#ddd';
      const role = player.className ? `LVL ${player.level} · ${player.className === 'Rogue' ? `Rogue · ${player.subclass || player.disguiseClass + ' guise'}` : `${player.subclass ? `${player.subclass} · ` : ''}${D.CLASSES[player.className]?.role || player.className}`}` : 'Class dealt randomly at start';
      const connectedState = connected.includes(player.id) ? 'online' : '';
      return `<div class="party-member ${player.id === state.playerId ? 'current' : ''} ${player.dead ? 'fallen' : ''}"><div class="avatar" style="color:${color}">${icons[player.className] || '●'}</div><div><div class="member-name">${escapeHtml(player.name)} ${player.id === state.playerId ? '<span class="you-tag">YOU</span>' : ''}${player.id === game.hostId ? '<span class="host-tag">HOST</span>' : ''}<i class="connection-state ${connectedState}" title="${connectedState ? 'Online' : 'Reconnecting'}"></i></div><div class="member-class">${escapeHtml(role)}${player.dead ? ' · FALLEN' : ''}</div></div><div class="member-hp"><span class="hp-text">${player.hp}/${player.maxHp} HP</span><div class="hp-track"><i class="${hpWidth < 35 ? 'low' : ''}" style="width:${hpWidth}%"></i></div><div class="member-guard">◈ ${player.guard || 0} guard</div></div></div>`;
    }).join('');
    const allItems = game.players.flatMap((player) => player.items.map((item) => ({ ...item, carrier: player.name, carrierId: player.id })));
    $('#party-items').innerHTML = `<div class="party-items-title">POCKETS · ${allItems.length}</div><div class="inventory">${allItems.length ? allItems.map((item) => `<button class="inventory-item ${item.kind}" data-item="${escapeHtml(item.id)}" data-owner="${escapeHtml(item.carrierId)}" title="${escapeHtml(item.text)}">${escapeHtml(item.name)}<small>${item.kind === 'consumable' ? `${escapeHtml(item.carrier)} · USE` : `${escapeHtml(item.carrier)} · PERMANENT`}</small></button>`).join('') : '<span class="member-class">No items yet.</span>'}</div>`;
    $('#party-items').querySelectorAll('.inventory-item.consumable').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.owner !== state.playerId) { showToast('Only the carrier can use this item.'); return; }
      act('consume', { itemId: button.dataset.item });
    }));
  }

  function renderEnemies(game) {
    const enemies = game.roomState?.enemies?.filter((enemy) => enemy.hp > 0) || [];
    $('#foe-count').textContent = enemies.length ? `${enemies.length} REMAIN` : '';
    $('#foe-list').innerHTML = enemies.length ? enemies.map((enemy) => `<div class="foe-row"><div class="foe-icon">${icons[enemy.name] || '♟'}</div><div><div class="foe-name">${escapeHtml(enemy.name)}${enemy.boss ? ' · BOSS' : ''}</div><div class="foe-ability">${escapeHtml(enemy.ability)}</div><div class="hp-track"><i class="low" style="width:${Math.round(enemy.hp / enemy.maxHp * 100)}%"></i></div></div><div class="foe-health">${enemy.hp}<small>/${enemy.maxHp} HP</small></div></div>`).join('') : `<div class="foe-empty">${game.phase === 'lobby' ? 'The hall is quiet — for now.' : game.phase === 'escape' ? 'No foes remain. Find the gate.' : 'All clear.'}</div>`;
  }

  function renderLog(room) {
    $('#event-log').innerHTML = room?.turnLog?.slice(-18).reverse().map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join('') || '<div class="log-line">The crew is still gathering.</div>';
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
    const lines = [];
    if (effect.damage) lines.push(`Damage ${effect.damage}: lowers HP; Guard absorbs it first.`);
    if (effect.shield) lines.push(`Guard ${effect.shield}: blocks incoming damage before HP.`);
    if (effect.heal) lines.push(`Heal ${effect.heal}: restores HP up to the target’s maximum.`);
    if (effect.range) lines.push(`Range ${effect.range}: farthest distance in tiles; diagonals count as 1.`);
    if (effect.move) lines.push(`Move ${effect.move}: travel up to this many tiles; diagonals count as 1.`);
    if (effect.push) lines.push(`Push ${effect.push}: shove the target away.`);
    if (effect.draw) lines.push(`Draw ${effect.draw}: take that many cards and gain one extra play per card drawn.`);
    if (effect.debuff) {
      const meanings = { weak: 'lowers damage dealt by 1', root: 'prevents movement', daze: 'lowers damage dealt by 1', slow: 'lowers damage dealt by 1', marked: 'makes the target easier to hurt', stun: 'skips the target’s next action' };
      lines.push(`${effect.debuff}: ${meanings[effect.debuff] || 'a negative effect that lasts for the shown turns'}.`);
    }
    if (effect.taunt) lines.push(`Taunt ${effect.taunt}: nearby foes are drawn to attack you.`);
    if (effect.buff === 'evasion' || effect.evade) lines.push('Evasion: avoid the next attack, or the attack that triggered this reaction.');
    if (effect.buff === 'fury') lines.push('Fury: deal extra damage with attacks while it lasts.');
    if (effect.teleport || effect.jump || effect.fly) lines.push('Jump/Fly/Teleport: cross blocked path tiles; you still need an open destination.');
    if (effect.cancelMelee) lines.push('Parry: cancel an adjacent melee attack.');
    if (effect.cancelRanged) lines.push('Cancel: prevent a ranged attack.');
    if (effect.lifesteal) lines.push(`Lifesteal ${effect.lifesteal}: heal yourself after dealing damage.`);
    if (effect.splash) lines.push(`Splash ${effect.splash}: affect enemies around the target.`);
    if (effect.cleanse) lines.push('Cleanse: remove a negative effect.');
    if (effect.target === 'ally') lines.push('Ally: choose yourself or a living teammate as the target.');
    if (effect.stealItem) lines.push('Steal: take one consumable from an adjacent player.');
    if (effect.charge) lines.push(`Charge: move up to ${effect.move || 0} tiles toward a target, then attack if in range.`);
    if (card.outOfTurn) lines.push(`Reaction: held for its printed trigger (“${card.text}”); the game pauses so you can respond or pass.`);
    return lines.join(' ');
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
      const locked = me.ended || !!game.roomState.enemyTurn || me.played >= playLimit;
      return `<div class="card-slot"><button class="card ${card.category} ${selected ? 'selected' : ''} ${variant ? 'flipped' : ''} ${card.outOfTurn ? 'reaction-only' : ''}" data-card="${card.uid}" data-tooltip="${escapeHtml(quickHelp)}" title="${escapeHtml(quickHelp)}" aria-label="${escapeHtml(quickHelp)}"><span class="card-name">${escapeHtml(variant?.name || card.name)}</span><span class="card-category">${escapeHtml(card.category)}${card.upgraded ? ' · EVOLVED' : ''}</span><span class="card-text">${escapeHtml(variant?.text || card.text)}</span><span class="card-bottom">${card.outOfTurn ? '<span class="card-out">↗ REACTION</span>' : '<span></span>'}<span class="card-pips">${Array.from({ length: Math.max(1, card.category === 'attack' ? card.effect.damage || 1 : card.category === 'defense' ? card.effect.shield || 1 : card.category === 'movement' ? card.effect.move || 1 : 1) }).slice(0, 4).map(() => '<i></i>').join('')}</span></span>${flip ? `<span class="flip-mark" data-flip="${card.uid}">${variant ? 'UNFLIP' : 'FLIP'}</span>` : ''}</button><button class="discard-card" data-discard="${card.uid}" ${locked ? 'disabled' : ''}>DISCARD · USE A PLAY</button></div>`;
    }).join('') : '<div class="empty-hand">Your hand is empty. When the draw pile runs out, your discard is shuffled back in.</div>';
    $('#hand-cards').querySelectorAll('.card').forEach((node) => node.addEventListener('click', (event) => {
      const card = me.hand.find((held) => held.uid === node.dataset.card); if (!card) return;
      if (card.outOfTurn) { showToast('Reaction cards wait for their trigger. Discard one to use a regular play.'); return; }
      if (me.ended || game.roomState.enemyTurn) { showToast('Wait until the enemy turn is over.'); return; }
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

  function renderReaction(game, me) {
    const panel = $('#reaction-panel');
    const room = game.roomState, turn = room?.enemyTurn, prompt = room?.reactionPrompt;
    if (!turn) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    const enemy = room.enemies.find((item) => item.id === turn.currentEnemyId);
    if (prompt?.playerId === me?.id) {
      const cards = (prompt.cardIds || []).map((id) => me.hand.find((card) => card.uid === id)).filter(Boolean);
      panel.innerHTML = `<div class="reaction-topline"><strong>REACTION · THE ENEMY IS PAUSED</strong><span>${escapeHtml(prompt.enemyName)} is targeting ${escapeHtml(prompt.targetName)}.</span></div><div class="reaction-options">${cards.map((card) => `<button class="reaction-choice" data-react="${card.uid}"><b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.text)}</small></button>`).join('')}<button id="pass-reaction" class="button button-quiet">PASS · LET IT HAPPEN</button></div>`;
      panel.querySelectorAll('[data-react]').forEach((button) => button.addEventListener('click', () => act('react', { cardId: button.dataset.react })));
      $('#pass-reaction')?.addEventListener('click', () => act('passReaction'));
      return;
    }
    if (prompt) panel.innerHTML = `<div class="reaction-topline"><strong>REACTION WINDOW · ENEMY TURN PAUSED</strong><span>${escapeHtml(prompt.playerName || game.players.find((player) => player.id === prompt.playerId)?.name || 'A hero')} is deciding whether to answer ${escapeHtml(prompt.enemyName)}.</span></div>`;
    else panel.innerHTML = `<div class="reaction-topline enemy-progress"><strong>CASTLE COMPANY TURN</strong><span>${enemy ? `${escapeHtml(enemy.name)} is acting now.` : 'Enemies are moving and attacking one at a time.'} Watch the map and field notes.</span></div>`;
  }

  function applyMobileLayout(game) {
    if (game.phase === 'reward') state.mobileTab = 'hand';
    else if (game.phase === 'escape') state.mobileTab = 'map';
    else if (game.phase === 'victory' || game.phase === 'defeat') state.mobileTab = 'hand';
    document.querySelectorAll('[data-mobile-pane]').forEach((node) => node.classList.toggle('mobile-pane-hidden', node.dataset.mobilePane !== state.mobileTab));
    document.querySelectorAll('[data-mobile-tab]').forEach((button) => button.classList.toggle('active', button.dataset.mobileTab === state.mobileTab));
  }

  function renderActions(game, me) {
    if (!me || game.phase !== 'battle') { $('#end-turn').classList.add('hidden'); $('#steal-artifact').classList.add('hidden'); }
    else {
      const turn = game.roomState.enemyTurn, prompt = game.roomState.reactionPrompt;
      const end = $('#end-turn'); end.classList.remove('hidden'); end.disabled = me.ended || me.dead || !!turn;
      end.textContent = turn ? 'ENEMY TURN' : me.ended ? 'WAITING FOR CREW' : 'END TURN ↗';
      const active = game.players.filter((player) => !player.dead && !player.ended).map((player) => player.name);
      const caption = me.dead ? 'You have fallen.' : prompt?.playerId === me.id ? 'Choose a reaction or pass.' : prompt ? `${game.players.find((player) => player.id === prompt.playerId)?.name || 'A hero'} is reacting.` : turn ? `${game.roomState.enemies.find((enemy) => enemy.id === turn.currentEnemyId)?.name || 'Castle company'} acts now.` : me.ended ? active.length ? `Waiting for ${active.join(', ')} to end turn.` : 'The castle company is next.' : `${Math.max(0, Number(me.playLimit || 2) - me.played)} card plays left this turn`;
      $('.turn-caption span:last-child').textContent = caption;
      $('.turn-caption').classList.toggle('waiting', me.ended || me.dead || !!turn);
      const canSteal = !turn && me.className === 'Rogue' && game.roomState.room === 12 && game.roomState.artifact === 'sealed';
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

  async function copyInvite() {
    const url = `${location.origin}${location.pathname}?room=${state.roomCode}`;
    try { await navigator.clipboard.writeText(url); showToast('Invite link copied. Send it to your crew.'); }
    catch { showToast(`Room code ${state.roomCode} — share it with your crew.`); }
  }

  function openRules() { $('#rules').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeRules() { $('#rules').classList.add('hidden'); document.body.style.overflow = ''; }

  document.querySelectorAll('[data-mobile-tab]').forEach((button) => button.addEventListener('click', () => { state.mobileTab = button.dataset.mobileTab; render(); }));
  $('#create-room').addEventListener('click', createRoom);
  $('#join-room').addEventListener('click', () => joinRoom());
  $('#join-code').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
  $('#join-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
  $('#copy-code').addEventListener('click', copyInvite);
  $('#open-rules').addEventListener('click', openRules);
  document.querySelectorAll('[data-close-rules]').forEach((node) => node.addEventListener('click', closeRules));
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeRules(); });
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) { $('#join-code').value = invite.toUpperCase(); setTimeout(() => $('#player-name').focus(), 200); }
  if (state.roomCode && state.roomCode === invite?.toUpperCase() && localStorage.getItem('crownfall-player')) reconnectSeat();
  else if (!invite && state.roomCode && localStorage.getItem('crownfall-player')) reconnectSeat();
})();
