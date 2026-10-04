(() => {
  const D = window.CrownfallData;
  const $ = (selector) => document.querySelector(selector);
  const state = { socket: null, game: null, playerId: localStorage.getItem('crownfall-player') || crypto.randomUUID(), roomCode: localStorage.getItem('crownfall-room') || '', selectedCard: null, discardMoveCardId: null, flipped: false, stepMode: false, mobileTab: 'map', handView: 'hand', guideRoom: '', guideOpen: false, guideIndex: 0, rogueAtStart: false, connected: false, toastTimer: null, enemyAlerts: [], enemyRoomKey: null, lastEnemyLogId: 0 };
  const GUIDE_SLIDES = [
    ['Your hand', 'At the start of your turn, draw up to 3 cards. You get 2 card plays. Unused cards stay in your hand for the next turn. Press 1–9 to select a card.'],
    ['Play or discard', 'Play a card for its effect, or discard it to move. The dots show the number of tiles that card moves: 1 for basic, 2 for class cards, 3 for evolved cards.'],
    ['Read the card', 'The highlighted stat badges show damage, Guard, healing, movement, and range. Select a card, then click a highlighted tile or foe. Diagonals count as 1 tile.'],
    ['Work as a crew', 'Guard absorbs damage before HP. Heal or protect allies, coordinate in the Chat tab, and take turns drafting room rewards. Press E to end your turn.'],
    ['Get the relic out', 'Clear 12 rooms across two floors, defeat the King and the vault guardian, then reach the red gate together. Good luck.']
  ];
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
          const incoming = message.game;
          const roomKey = `${incoming.code}:${incoming.roomState?.room || 'lobby'}`;
          const incomingLogs = incoming.roomState?.turnLog || [];
          if (state.enemyRoomKey !== roomKey) {
            state.enemyRoomKey = roomKey; state.enemyAlerts = [];
            state.lastEnemyLogId = Math.max(0, ...incomingLogs.map((entry) => Number(entry.id || 0)));
          } else {
            const fresh = incomingLogs.filter((entry) => entry.kind === 'enemy' && Number(entry.id || 0) > state.lastEnemyLogId);
            state.enemyAlerts.push(...fresh.map((entry) => ({ text: entry.text, detail: entry.detail || '' })));
            state.enemyAlerts = state.enemyAlerts.slice(-6);
            state.lastEnemyLogId = Math.max(state.lastEnemyLogId, ...incomingLogs.map((entry) => Number(entry.id || 0)));
          }
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
    try { await connect(); state.socket.send(JSON.stringify({ type: 'join', code: state.roomCode, playerId: state.playerId, name: localStorage.getItem('crownfall-name') || '' })); }
    catch { status(false, 'Connection interrupted'); }
  }

  async function createRoom() {
    const name = $('#player-name').value.trim();
    localStorage.setItem('crownfall-name', name);
    state.rogueAtStart = false;
    state.playerId = crypto.randomUUID(); localStorage.setItem('crownfall-player', state.playerId);
    await send('create', { playerId: state.playerId, name });
  }

  async function joinRoom(codeOverride) {
    const code = String(codeOverride || $('#join-code').value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) { $('#entry-error').textContent = 'Enter the five-letter room code.'; return; }
    const name = $('#player-name').value.trim();
    localStorage.setItem('crownfall-name', name);
    if (!localStorage.getItem('crownfall-player') || localStorage.getItem('crownfall-room') !== code) state.playerId = crypto.randomUUID();
    else state.playerId = localStorage.getItem('crownfall-player');
    localStorage.setItem('crownfall-player', state.playerId);
    await send('join', { code, playerId: state.playerId, name });
  }

  function act(kind, rest = {}) { return send('action', { action: { kind, ...rest } }); }

  function render(connected = []) {
    const game = state.game; if (!game) return;
    if (game.phase === 'battle' && state.guideRoom !== game.code) { state.guideRoom = game.code; state.guideOpen = true; state.guideIndex = 0; document.body.style.overflow = 'hidden'; }
    renderGuide();
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
    renderEnemyAlerts();
    renderLog(room, game);
    renderChat(game);
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

  function renderGuide() {
    const overlay = $('#start-guide');
    overlay.classList.toggle('hidden', !state.guideOpen);
    if (!state.guideOpen) return;
    const [title, copy] = GUIDE_SLIDES[state.guideIndex];
    $('#guide-count').textContent = `STEP ${state.guideIndex + 1} / ${GUIDE_SLIDES.length}`;
    $('#guide-title').textContent = title;
    $('#guide-copy').textContent = copy;
    $('#guide-previous').disabled = state.guideIndex === 0;
    $('#guide-next').textContent = state.guideIndex === GUIDE_SLIDES.length - 1 ? 'START PLAYING ↗' : 'NEXT ↗';
  }

  function closeGuide() {
    state.guideOpen = false;
    $('#start-guide').classList.add('hidden');
    document.body.style.overflow = '';
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
        skill: { stealItem: true, range: 1, draw: 1, target: 'any' }
      })[card.category] || card.effect;
    }
    return card?.effect || {};
  }

  function statBonus(me, name) {
    return (me?.abilities || []).reduce((sum, ability) => sum + (ability.effect === name ? Number(ability.value || 1) : 0), 0)
      + (me?.items || []).reduce((sum, item) => sum + Number(item[name] || 0), 0);
  }

  function combatClass(me) { return me?.disguiseClass || me?.className; }

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
    const discardMoveCard = me?.hand.find((held) => held.uid === state.discardMoveCardId);
    const selectedMove = !!discardMoveCard;
    const playerClass = combatClass(me);
    const moveBonus = me ? statBonus(me, 'move') + (me.buffs.find((buff) => buff.type === 'freeMove')?.value || 0) + (playerClass === 'Ranger' && me.played === 0 ? 1 : 0) : 0;
    const discardRarity = discardMoveCard ? (discardMoveCard.upgraded ? 3 : Number(discardMoveCard.rarity || (discardMoveCard.unique ? 2 : 1))) : 0;
    let maxMove = selectedMove ? (discardMoveCard ? discardRarity : Number(effect.move || 0)) + moveBonus : 0;
    if (room.modifier?.rule === 'rough_move' && selectedMove) maxMove = Math.max(1, maxMove - 1);
    const moveTiles = selectedMove && me ? movementReach(room, me, maxMove, !!(effect.teleport || effect.jump || card?.id === 'rogue-shadowstep')) : new Set();
    const isAttack = !!card && (card.category === 'attack' || !!effect.damage);
    const wizardSpellRange = isAttack && playerClass === 'Wizard' && card.unique ? 1 : 0;
    const targetRange = card ? Number(effect.range || (effect.debuff || effect.taunt || effect.target === 'enemy' ? 4 : effect.heal || effect.target === 'ally' ? 99 : 1)) + (isAttack ? statBonus(me, 'range') + (playerClass === 'Ranger' ? 1 : 0) + wizardSpellRange + Number(room.modifier?.hero?.range || 0) : abilityBonus(me, 'range')) : 0;
    const targetsEnemy = !!card && (card.category === 'attack' || effect.damage || effect.debuff || effect.taunt || effect.target === 'enemy');
    const targetsAlly = !!card && !targetsEnemy && (effect.heal || effect.target === 'ally' || effect.stealItem);
    const isMovingNow = !!state.stepMode || game.phase === 'escape';
    const stepTiles = isMovingNow && me ? movementReach(room, me, state.stepMode ? 1 : 1) : new Set();
    const moveSet = selectedMove ? moveTiles : stepTiles;
    let hint = discardMoveCard ? `Discard ${discardMoveCard.name} to move up to ${maxMove} tiles. Choose a green tile.` : selectedMove ? `Green tiles: move up to ${maxMove} tile${maxMove === 1 ? '' : 's'}; diagonals count as 1.` : state.stepMode ? 'Choose an open tile within 1 step (diagonals count).' : targetsEnemy || targetsAlly ? `Select a highlighted target within ${targetRange} tile${targetRange === 1 ? '' : 's'}; diagonals count as 1.` : 'Choose a card, then click a highlighted tile or target.';
    if (game.phase === 'escape') hint = 'Use Move to walk toward the red gate. Diagonals count as 1 tile.';
    $('#map-hint').textContent = hint;
    const guard = me?.guard ?? 0;
    const movementText = selectedMove ? `MOVE · UP TO ${maxMove}` : `MOVE · DISCARD A CARD${moveBonus ? ` · BONUS +${moveBonus}` : ''}`;
    const rangeText = targetRange >= 99 ? 'RANGE · ALL TILES' : `RANGE · ${targetRange} TILES`;
    const classLabel = me?.className === 'Rogue' ? `ROGUE · ${me.disguiseClass || 'DISGUISE'}` : me?.subclass ? `${me.className} · ${me.subclass}` : me?.className;
    const classChip = me?.className ? `<span class="status-chip class-chip">CLASS · ${escapeHtml(classLabel)}</span>` : '';
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
    if (state.discardMoveCardId) { act('discardMove', { cardId: state.discardMoveCardId, x, y }); state.discardMoveCardId = null; return; }
    const card = me?.hand.find((held) => held.uid === state.selectedCard);
    if (!card) { if (targetEnemy) showToast(`${targetEnemy.name}: ${targetEnemy.hp}/${targetEnemy.maxHp} HP. ${targetEnemy.ability}`); return; }
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
      const role = player.className ? `CLASS · ${player.className === 'Rogue' ? `Rogue · ${player.disguiseClass || 'hidden guise'}` : `${player.className}${player.subclass ? ` · ${player.subclass}` : ''}`} · LVL ${player.level} · ${D.CLASSES[player.className]?.role || player.className}` : 'Class dealt randomly at start';
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
    const effects = (enemy) => [...(enemy.buffs || []).map((effect) => ({ ...effect, good: true })), ...(enemy.debuffs || []).map((effect) => ({ ...effect, good: false }))].map((effect) => `<span class="status-badge ${effect.good ? 'good' : 'bad'}" data-tooltip="${escapeHtml(statusDescription(effect.type, effect.turns))}">${statusIcon(effect.type)} ${escapeHtml(effect.type)} · ${Number(effect.turns || 0)}T</span>`).join('');
    $('#foe-list').innerHTML = enemies.length ? enemies.map((enemy) => `<div class="foe-row"><div class="foe-icon">${icons[enemy.name] || '♟'}</div><div><div class="foe-name">${escapeHtml(enemy.name)}${enemy.boss ? ' · BOSS' : ''}</div><div class="foe-ability">${escapeHtml(enemy.ability)}</div><div class="foe-effects">${effects(enemy) || '<span class="foe-status-empty">No status effects</span>'}</div>${enemy.lastCard ? `<div class="enemy-last-card">LAST · ${escapeHtml(enemy.lastCard.name)} · RANGE ${Number(enemy.lastCard.range || enemy.range)}</div>` : ''}<div class="hp-track"><i class="low" style="width:${Math.round(enemy.hp / enemy.maxHp * 100)}%"></i></div><div class="enemy-deck-count">DECK ${enemy.deckCount ?? 15} · DISCARD ${enemy.discardCount ?? 0}</div></div><div class="foe-health">${enemy.hp}<small>/${enemy.maxHp} HP</small><small>◈ ${enemy.guard || 0} Guard</small></div></div>`).join('') : `<div class="foe-empty">${game.phase === 'lobby' ? 'The hall is quiet — for now.' : game.phase === 'escape' ? 'No foes remain. Find the gate.' : 'All clear.'}</div>`;
  }

  function renderLog(room, game) {
    const entries = room?.turnLog || game?.lobbyLog || [];
    $('#event-log').innerHTML = entries.slice(-18).reverse().map((entry) => {
      const text = typeof entry === 'string' ? entry : entry.text, detail = typeof entry === 'string' ? '' : entry.detail;
      const enemy = typeof entry !== 'string' && entry.kind === 'enemy';
      return `<div class="log-line ${detail ? 'has-detail' : ''} ${enemy ? 'enemy-log-line' : ''}" ${detail ? `data-tooltip="${escapeHtml(detail)}" tabindex="0"` : ''}>${enemy ? '<b class="enemy-log-tag">ENEMY</b> ' : ''}${escapeHtml(text)}${detail ? `<small class="log-detail">${escapeHtml(detail)}</small>` : ''}</div>`;
    }).join('') || '<div class="log-line">The crew is still gathering.</div>';
  }

  function renderEnemyAlerts() {
    const panel = $('#enemy-action-popups');
    if (!state.enemyAlerts.length) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="enemy-alert-heading"><strong>ENEMY ACTIONS</strong><button type="button" aria-label="Dismiss enemy actions">×</button></div>${state.enemyAlerts.map((entry) => `<div class="enemy-alert"><b>${escapeHtml(entry.text)}</b>${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ''}</div>`).join('')}`;
    panel.querySelector('button').addEventListener('click', () => { state.enemyAlerts = []; renderEnemyAlerts(); });
  }

  function renderChat(game) {
    const messages = game.chat || [];
    $('#chat-messages').innerHTML = messages.length ? messages.slice(-60).map((entry) => `<div class="chat-message ${entry.playerId === state.playerId ? 'mine' : ''}"><b>${escapeHtml(entry.name)}</b><span>${escapeHtml(entry.text)}</span></div>`).join('') : '<div class="chat-empty">Send a message to your crew. Chat updates live for everyone in the room.</div>';
    $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  }

  function renderScoreboard(game) {
    const playerRows = game.players.map((player) => {
      const stats = player.stats || {};
      const className = player.className === 'Rogue' ? `Rogue · ${player.disguiseClass || 'hidden guise'}` : `${player.className || 'Unassigned'}${player.subclass ? ` · ${player.subclass}` : ''}`;
      return `<tr><th>${escapeHtml(player.name)}<small>CLASS · ${escapeHtml(className)}</small></th><td>${stats.damageDealt || 0}</td><td>${stats.damageTaken || 0}</td><td>${stats.damageHealed || 0}</td><td>${stats.buffsGiven || 0}</td><td>${stats.debuffsGiven || 0}</td></tr>`;
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
    const meaning = { weak: 'Weak: this unit deals less damage.', root: 'Rooted: this unit cannot move.', daze: 'Dazed: this unit deals less damage.', slow: 'Slowed: this unit deals less damage.', marked: 'Marked: this unit takes extra damage.', stun: 'Stunned: this unit skips its next action.', fury: 'Fury: attacks deal extra damage.', evasion: 'Evasion: avoid one attack.', taunt: 'Taunt: enemies focus this unit.', nextAttack: 'Next attack deals extra damage.', freeMove: 'Extra movement is ready.', aim: 'Aimed: the next attack hits harder.' };
    return `${meaning[type] || type}${turns ? ` · ${turns} turn${turns === 1 ? '' : 's'}` : ''}`;
  }

  function renderModifier(room) {
    const el = $('#modifier-banner');
    if (!room?.modifier) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden'); el.innerHTML = `<strong>ROOM EFFECT · ${escapeHtml(room.modifier.name)}</strong><span>✦ ${escapeHtml(room.modifier.buff)} &nbsp;·&nbsp; ⚠ ${escapeHtml(room.modifier.debuff)}</span>`;
  }

  function flippedCard(card) {
    return ({ attack: { name: 'Backstab', text: 'Deal 2 damage. Rogue may target a player.' }, defense: { name: 'Fade Away', text: 'Gain 2 guard and become hard to target.' }, skill: { name: 'Lift Purse', text: 'Steal a consumable from an adjacent player or draw a card.' } })[card.category] || { name: 'Lift Purse', text: 'Steal a consumable or draw a card.' };
  }

  function discardMoveValue(card, me, game) {
    let value = (card.upgraded ? 3 : Number(card.rarity || (card.unique ? 2 : 1))) + statBonus(me, 'move');
    value += me.buffs.find((buff) => buff.type === 'freeMove')?.value || 0;
    if (combatClass(me) === 'Ranger' && me.played === 0) value++;
    if (game.roomState?.modifier?.rule === 'rough_move') value = Math.max(1, value - 1);
    return value;
  }

  function cardTextForPlayer(card, effect, me) {
    const name = me?.name || 'you';
    const splash = Number(effect.splash || 1) + abilityBonus(me, 'splash');
    const reach = Number(effect.range || effect.taunt || 1) + abilityBonus(me, 'range');
    return String(card.text || '')
      .replace(/nearby foes/gi, `foes within ${splash} tile${splash === 1 ? '' : 's'} of ${name}'s target`)
      .replace(/adjacent foes/gi, `foes within ${splash} tile${splash === 1 ? '' : 's'} of ${name}'s target`)
      .replace(/within \d+ tiles? of (?:it|the target)/i, `within ${splash} tile${splash === 1 ? '' : 's'} of ${name}'s target`)
      .replace(/your target/gi, `${name}'s target`)
      .replace(/Taunt foes within \d+ tiles?/i, `Taunt foes within ${reach} tile${reach === 1 ? '' : 's'} of ${name}`)
      .replace(/Taunt a foe within \d+ tiles?/i, `Taunt a foe within ${reach} tile${reach === 1 ? '' : 's'} of ${name}`);
  }

  function cardStats(card, effect, me, game) {
    const playerClass = combatClass(me);
    const attack = card.category === 'attack' || Number(effect.damage || 0) > 0;
    const targeted = attack || effect.debuff || effect.taunt || effect.heal || effect.target === 'ally' || effect.target === 'enemy' || effect.stealItem;
    const baseRange = Number(effect.range || (targeted ? effect.heal || effect.target === 'ally' ? 99 : effect.taunt || effect.debuff ? 4 : 1 : 0));
    const range = baseRange ? baseRange + (attack ? statBonus(me, 'range') + (playerClass === 'Ranger' ? 1 : 0) + (playerClass === 'Wizard' && card.unique ? 1 : 0) + Number(game.roomState?.modifier?.hero?.range || 0) : abilityBonus(me, 'range')) : 0;
    const stats = [];
    if (effect.damage) stats.push(['damage', `Damage ${effect.damage}`]);
    if (effect.shield) stats.push(['guard', `Guard ${effect.shield}`]);
    if (effect.heal) stats.push(['heal', `Heal ${effect.heal}`]);
    if (effect.draw) stats.push(['draw', `Draw ${effect.draw}`]);
    if (effect.move) stats.push(['move', `${effect.damage ? 'Charge' : 'Move'} ${effect.move}`]);
    if (effect.push) stats.push(['push', `Push ${effect.push}`]);
    if (effect.debuff) stats.push(['status', statusName(effect.debuff)]);
    if (effect.buff) stats.push(['status', statusName(effect.buff)]);
    if (effect.taunt) stats.push(['taunt', `Taunt ${effect.taunt}`]);
    if (effect.splash) stats.push(['area', `Area ${effect.splash}`]);
    if (effect.cleanse) stats.push(['cleanse', 'Cleanse']);
    if (effect.lifesteal) stats.push(['heal', `Drain ${effect.lifesteal}`]);
    if (effect.unpushable) stats.push(['guard', 'Hold Fast']);
    if (effect.stealItem) stats.push(['utility', 'Steal']);
    if (range) stats.push(['range', range >= 99 ? 'Range · All Tiles' : `Range ${range}`]);
    return `<div class="card-stats">${stats.map(([kind, label]) => `<span class="card-stat ${kind}">${escapeHtml(label)}</span>`).join('')}</div>`;
  }

  function statusName(type) {
    return ({ weak: 'Weaken', root: 'Root', daze: 'Daze', slow: 'Slow', marked: 'Mark', stun: 'Stun', fury: 'Fury', evasion: 'Evasion', taunt: 'Taunt', nextAttack: 'Next Attack', freeMove: 'Free Move', aim: 'Aim' })[type] || type;
  }

  function cardTooltip(card, effect, me, moveValue) {
    const terms = [];
    if (effect.damage) terms.push('Damage lowers HP; Guard absorbs it first.');
    if (effect.shield) terms.push('Guard blocks damage before HP.');
    if (effect.heal) terms.push('Heal restores HP.');
    if (effect.draw) terms.push('Draw a card and gain another play.');
    if (effect.debuff) terms.push(statusDescription(effect.debuff, 1));
    if (effect.buff) terms.push(statusDescription(effect.buff, 1));
    if (effect.taunt) { const reach = Number(effect.range || effect.taunt) + abilityBonus(me, 'range'); terms.push(`Taunt foes within ${reach} tile${reach === 1 ? '' : 's'} of ${me.name}.`); }
    if (effect.push) terms.push('Push moves the target away from you.');
    if (effect.splash) { const radius = effect.splash + abilityBonus(me, 'splash'); terms.push(`Area effect hits foes within ${radius} tile${radius === 1 ? '' : 's'} of ${me.name}'s target.`); }
    if (effect.cleanse) terms.push('Cleanse removes a harmful effect.');
    terms.push(`Dots: discard this card to move up to ${moveValue} tile${moveValue === 1 ? '' : 's'}.`);
    return terms.slice(0, 3).join(' ');
  }

  function activateHandCard(card, me) {
    if (!card || !me) return;
    if (me.ended) { showToast('Your turn is already ended.'); return; }
    if (state.selectedCard === card.uid) { state.selectedCard = null; state.flipped = false; render(); return; }
    state.selectedCard = card.uid; state.flipped = false;
    const targetRequired = card.category === 'attack' || card.effect.damage || card.effect.debuff || card.effect.taunt || card.effect.heal || card.effect.target === 'ally' || card.effect.target === 'enemy' || (me.className === 'Rogue' && card.unique && state.flipped && card.category === 'skill');
    if (!targetRequired) { act('play', { cardId: card.uid }); state.selectedCard = null; }
    else state.mobileTab = 'map';
    render();
  }

  function renderHand(game, me) {
    const panel = $('#hand-panel');
    if (!me || game.phase !== 'battle') { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const deck = [...me.hand, ...me.draw, ...me.discard];
    $('#hand-count').textContent = `${me.hand.length} / ${me.handSize || 3}`;
    $('#deck-count').textContent = `Deck ${deck.length} · Draw ${me.draw.length} · Discard ${me.discard.length}${me.draw.length === 0 && me.discard.length ? ' · reshuffles on draw' : ''}`;
    $('#deck-total').textContent = deck.length;
    const playLimit = Number(me.playLimit || 2);
    $('#hand-rule').textContent = `${Math.max(0, playLimit - me.played)} PLAYS LEFT · 1–9 SELECT · DISCARD USES A PLAY`;
    $('#hand-cards').classList.toggle('hidden', state.handView !== 'hand');
    $('#deck-list').classList.toggle('hidden', state.handView !== 'deck');
    document.querySelectorAll('[data-hand-view]').forEach((button) => {
      const active = button.dataset.handView === state.handView;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
    });
    const grouped = new Map();
    for (const card of deck) {
      const key = `${card.id}:${card.upgraded ? card.upgradeFocus || 'evolved' : 'base'}`;
      const entry = grouped.get(key) || { card, copies: 0 };
      entry.copies++; grouped.set(key, entry);
    }
    const order = { attack: 0, defense: 1, skill: 2, movement: 3 };
    $('#deck-list').innerHTML = grouped.size ? [...grouped.values()].sort((a, b) => order[a.card.category] - order[b.card.category] || a.card.name.localeCompare(b.card.name)).map(({ card, copies }) => `<article class="deck-row ${card.category}"><div class="deck-row-heading"><strong>${escapeHtml(card.name)}${card.upgraded ? ' · EVOLVED' : ''}</strong><span>× ${copies}</span></div><div class="deck-row-category">${escapeHtml(card.category)}${card.unique ? ' · CLASS' : ' · BASIC'}</div><p>${escapeHtml(cardTextForPlayer(card, card.effect, me))}</p>${cardStats(card, card.effect, me, game)}</article>`).join('') : '<p class="empty-hand">Your deck is empty.</p>';
    $('#hand-cards').innerHTML = me.hand.length ? me.hand.map((card, index) => {
      const selected = state.selectedCard === card.uid;
      const flip = me.className === 'Rogue' && card.unique;
      const variant = state.flipped && selected && flip ? flippedCard(card) : null;
      const effect = variant ? visualEffect(card, me) : card.effect;
      const moveValue = discardMoveValue(card, me, game);
      const quickHelp = cardTooltip(card, effect, me, moveValue);
      const locked = me.ended || me.played >= playLimit;
      return `<div class="card-slot"><button class="card ${card.category} ${selected ? 'selected' : ''} ${variant ? 'flipped' : ''}" data-card="${card.uid}" data-tooltip="${escapeHtml(quickHelp)}"><span class="card-key" aria-hidden="true">${index < 9 ? index + 1 : ''}</span><span class="card-name">${escapeHtml(variant?.name || card.name)}</span><span class="card-category">${escapeHtml(card.category)}${card.upgraded ? ' · EVOLVED' : ''}</span><span class="card-text">${escapeHtml(cardTextForPlayer(variant ? { ...card, text: variant.text } : card, effect, me))}</span>${cardStats(card, effect, me, game)}<span class="card-bottom"><span></span><span class="card-pips" title="${moveValue} dot${moveValue === 1 ? '' : 's'} = move up to ${moveValue} tile${moveValue === 1 ? '' : 's'} if discarded" aria-label="Discard movement: ${moveValue} tile${moveValue === 1 ? '' : 's'}">${Array.from({ length: moveValue }, () => '<i></i>').join('')}</span></span>${flip ? `<span class="flip-mark" data-flip="${card.uid}">${variant ? 'UNFLIP' : 'FLIP'}</span>` : ''}</button><button class="discard-card" data-discard="${card.uid}" ${locked ? 'disabled' : ''}>DISCARD · USE A PLAY</button><button class="discard-move-card" data-discard-move="${card.uid}" ${locked ? 'disabled' : ''} title="Discard this card to move up to ${moveValue} tiles">DISCARD TO MOVE · ${moveValue}</button></div>`;
    }).join('') : '<div class="empty-hand">Your hand is empty. When the draw pile runs out, your discard is shuffled back in.</div>';
    $('#hand-cards').querySelectorAll('.card').forEach((node) => node.addEventListener('click', (event) => {
      const card = me.hand.find((held) => held.uid === node.dataset.card); if (!card) return;
      if (event.target.closest('[data-flip]')) { if (state.selectedCard !== card.uid) { state.selectedCard = card.uid; state.flipped = true; } else state.flipped = !state.flipped; state.mobileTab = 'map'; render(); return; }
      activateHandCard(card, me);
    }));
    $('#hand-cards').querySelectorAll('.discard-card').forEach((button) => button.addEventListener('click', () => { act('discardCard', { cardId: button.dataset.discard }); state.selectedCard = null; state.flipped = false; }));
    $('#hand-cards').querySelectorAll('.discard-move-card').forEach((button) => button.addEventListener('click', () => { state.discardMoveCardId = button.dataset.discardMove; state.selectedCard = null; state.flipped = false; state.mobileTab = 'map'; render(); }));
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
    const sideTabs = ['party', 'foes', 'log', 'chat', 'score'];
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
      end.innerHTML = me.ended ? 'WAITING FOR CREW' : 'END TURN <kbd>E</kbd> <span>↗</span>';
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

  function leaveGame() {
    const socket = state.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'leave' }));
      socket.close();
    }
    state.socket = null; state.game = null; state.roomCode = ''; state.playerId = crypto.randomUUID();
    state.selectedCard = null; state.flipped = false; state.stepMode = false;
    localStorage.removeItem('crownfall-room'); localStorage.removeItem('crownfall-player');
    $('#game-view').classList.add('hidden'); $('#home-view').classList.remove('hidden'); closeGuide();
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
  document.querySelectorAll('[data-hand-view]').forEach((button) => button.addEventListener('click', () => { state.handView = button.dataset.handView; render(); }));
  $('#guide-skip').addEventListener('click', closeGuide);
  $('#guide-previous').addEventListener('click', () => { state.guideIndex = Math.max(0, state.guideIndex - 1); renderGuide(); });
  $('#guide-next').addEventListener('click', () => { if (state.guideIndex >= GUIDE_SLIDES.length - 1) closeGuide(); else { state.guideIndex++; renderGuide(); } });
  window.addEventListener('resize', () => { if (state.game) applyMobileLayout(state.game); });
  $('#create-room').addEventListener('click', createRoom);
  $('#join-room').addEventListener('click', () => joinRoom());
  $('#join-code').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
  $('#join-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
  $('#chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('#chat-input').value.trim().slice(0, 300);
    if (!text) return;
    send('chat', { text }); $('#chat-input').value = '';
  });
  $('#copy-code').addEventListener('click', copyInvite);
  $('#leave-game').addEventListener('click', leaveGame);
  $('#open-rules').addEventListener('click', openRules);
  document.querySelectorAll('[data-close-rules]').forEach((node) => node.addEventListener('click', closeRules));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { if (state.guideOpen) closeGuide(); else closeRules(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || state.guideOpen || !$('#rules').classList.contains('hidden') || !state.game || state.game.phase !== 'battle') return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
    if (event.key.toLowerCase() === 'e') {
      const me = myPlayer();
      if (me && !me.ended && !me.dead) { event.preventDefault(); $('#end-turn').click(); }
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      const me = myPlayer(), index = Number(event.key) - 1;
      if (!me || index >= me.hand.length) return;
      event.preventDefault(); activateHandCard(me.hand[index], me);
    }
  });
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) { $('#join-code').value = invite.toUpperCase(); setTimeout(() => $('#player-name').focus(), 200); }
  if (state.roomCode && state.roomCode === invite?.toUpperCase() && localStorage.getItem('crownfall-player')) reconnectSeat();
  else if (!invite && state.roomCode && localStorage.getItem('crownfall-player')) reconnectSeat();
})();
