(() => {
  const D = window.CrownfallData;
  const $ = (selector) => document.querySelector(selector);
  const state = { socket: null, game: null, playerId: localStorage.getItem('crownfall-player') || crypto.randomUUID(), roomCode: localStorage.getItem('crownfall-room') || '', selectedCard: null, flipped: false, stepMode: false, connected: false, toastTimer: null };
  const icons = { Wizard: '✧', Weaver: '❋', Barbarian: '⚒', Ranger: '➶', Swordsman: '⚔', Knight: '⬟', Rogue: '♠', Guard: '♟', Soldier: '⚔', Archer: '➶', Horse: '♞', 'Guard Dog': '♣', Monster: '♧', Skeleton: '☠', Zombie: '♨', Beast: '♢', King: '♛', Basilisk: '◈', Cockatrice: '☗', Gryphon: '♜' };
  const names = ['The Gatehouse', 'Stable Court', 'Moon Gallery', 'Barracks', 'Old Chapel', 'Throne Hall', 'Crypt Stair', 'Bone Gallery', 'Flooded Cellar', 'Beast Pens', 'Hall of Echoes', 'Basilisk Vault'];
  const descriptions = { Wizard: 'Spell slinger · control and utility', Weaver: 'Mender · healing and hexes', Barbarian: 'Front line · cleave and taunt', Ranger: 'Marksman · range and evasion', Swordsman: 'Duelist · focus and parry', Knight: 'Shield bearer · push and protect', Rogue: 'Saboteur · secretly steal the relic' };

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function myPlayer() { return state.game?.players.find((player) => player.id === state.playerId); }
  function showToast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
  function status(online, label) { state.connected = online; const node = $('#connection'); node.classList.toggle('online', online); node.classList.toggle('offline', !online && state.socket); $('#connection-label').textContent = label; }

  function fillClassSelect() {
    const select = $('#class-select');
    select.innerHTML = ['Random', ...D.CLASS_ORDER, 'Rogue'].map((name) => `<option value="${name}">${name === 'Random' ? '✦  Surprise me — random class' : `${icons[name]}  ${name} — ${descriptions[name]}`}</option>`).join('');
    $('#disguise-select').innerHTML = D.CLASS_ORDER.map((name) => `<option value="${name}">${name}</option>`).join('');
    select.addEventListener('change', () => $('#disguise-wrap').classList.toggle('hidden', select.value !== 'Rogue'));
    $('#rogue-enabled').addEventListener('change', () => {
      const rogueOption = [...select.options].find((o) => o.value === 'Rogue');
      rogueOption.disabled = !$('#rogue-enabled').checked;
      if (rogueOption.disabled && select.value === 'Rogue') select.value = 'Wizard';
      $('#disguise-wrap').classList.toggle('hidden', select.value !== 'Rogue');
    });
    [...select.options].find((o) => o.value === 'Rogue').disabled = true;
  }

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
    try { await connect(); state.socket.send(JSON.stringify({ type: 'join', code: state.roomCode, playerId: state.playerId, name: localStorage.getItem('crownfall-name') || 'Adventurer', className: 'Wizard' })); }
    catch { status(false, 'Connection interrupted'); }
  }

  async function createRoom() {
    const name = $('#player-name').value.trim() || 'Adventurer';
    const className = $('#class-select').value;
    const rogueEnabled = $('#rogue-enabled').checked;
    if (className === 'Rogue') { $('#entry-error').textContent = 'The Rogue can join once at least two crew members are in the room.'; return; }
    localStorage.setItem('crownfall-name', name);
    state.playerId = crypto.randomUUID(); localStorage.setItem('crownfall-player', state.playerId);
    await send('create', { playerId: state.playerId, name, className, rogueEnabled });
  }

  async function joinRoom(codeOverride) {
    const code = String(codeOverride || $('#join-code').value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code.length !== 5) { $('#entry-error').textContent = 'Enter the five-letter room code.'; return; }
    const name = $('#player-name').value.trim() || localStorage.getItem('crownfall-name') || 'Adventurer';
    localStorage.setItem('crownfall-name', name);
    if (!localStorage.getItem('crownfall-player') || localStorage.getItem('crownfall-room') !== code) state.playerId = crypto.randomUUID();
    else state.playerId = localStorage.getItem('crownfall-player');
    localStorage.setItem('crownfall-player', state.playerId);
    await send('join', { code, playerId: state.playerId, name, className: $('#class-select').value, disguiseClass: $('#disguise-select').value });
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
    $('#map-label').textContent = room ? `${names[room.room - 1]} · ${game.phase === 'escape' ? 'Escape' : game.phase === 'reward' ? 'Rewards' : 'Fight'}` : 'Choose your class and invite your crew';
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
    const name = escapeHtml(me?.name || 'Adventurer');
    const seats = game.players.length;
    const rogue = game.rogueEnabled ? 'Optional Rogue enabled.' : 'Rogue mode is off.';
    banner.innerHTML = `<strong>Room ${escapeHtml(game.code)}</strong> · Invite friends with the code or <button class="inline-link" id="share-lobby">copy invite link</button>. ${seats < 2 ? 'A second player is needed before the host can start.' : `${seats} players are ready.`} ${rogue}<div class="host-controls">${game.hostId === state.playerId ? `<button class="button button-primary" id="start-run" ${seats < 2 ? 'disabled' : ''}>START THE HEIST <span>↗</span></button><span class="host-note">You’re hosting. Your class: ${escapeHtml(me?.className)}.</span>` : `<span class="host-note">Waiting for ${escapeHtml(game.players.find((p) => p.id === game.hostId)?.name || 'the host')} to begin.</span>`}</div>`;
    $('#start-run')?.addEventListener('click', () => act('start'));
    $('#share-lobby')?.addEventListener('click', copyInvite);
    $('.turn-caption span:last-child').textContent = game.players.length >= 2 ? 'The host can begin when ready.' : 'Waiting for another player to join.';
  }

  function renderMap(game, me) {
    const room = game.roomState;
    if (!room) { $('#tile-map').innerHTML = ''; $('#map-hint').textContent = 'Your crew will appear here when the host starts.'; return; }
    const walls = new Set(room.map.walls);
    let hint = state.stepMode ? 'Choose an adjacent open tile to move one step.' : state.selectedCard ? 'Choose a highlighted tile or target to play the selected card.' : 'Choose a card, then click a tile or target.';
    if (game.phase === 'escape') hint = state.stepMode ? 'Choose an open tile beside you. Keep moving to the red gate.' : 'The party has the relic. Move toward the red gate.';
    $('#map-hint').textContent = hint;
    const map = [];
    for (let y = 0; y < room.map.size; y++) for (let x = 0; x < room.map.size; x++) {
      const key = `${x},${y}`, wall = walls.has(key), isExit = game.phase === 'escape' && x === room.exit.x && y === room.exit.y;
      const player = game.players.find((p) => !p.dead && p.x === x && p.y === y);
      const enemy = room.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
      const actor = player || enemy;
      let token = '';
      if (player) token = `<span class="map-token ally-token"><span class="token-emoji">${icons[player.className] || '●'}</span><span class="token-name">${escapeHtml(player.name.slice(0, 8))}</span><span class="token-hp"><i style="width:${Math.round(player.hp / player.maxHp * 100)}%"></i></span></span>`;
      else if (enemy) token = `<span class="map-token"><span class="token-emoji">${icons[enemy.name] || '♟'}</span><span class="token-name">${escapeHtml(enemy.name.slice(0, 8))}</span><span class="token-hp"><i style="width:${Math.round(enemy.hp / enemy.maxHp * 100)}%"></i></span></span>`;
      const active = state.selectedCard && (!wall || state.flipped) ? 'is-target' : '';
      map.push(`<button class="tile ${wall ? 'wall' : ''} ${isExit ? 'is-exit' : ''} ${active}" role="gridcell" data-x="${x}" data-y="${y}" ${wall && !state.flipped ? 'disabled' : ''} title="${x + 1}, ${y + 1}${player ? ` · ${escapeHtml(player.name)}` : ''}${enemy ? ` · ${escapeHtml(enemy.name)} ${enemy.hp}/${enemy.maxHp} HP` : ''}">${token}${wall && !actor ? '<span class="wall-glyph">▰</span>' : ''}${isExit && !actor ? '<span class="token-emoji exit-glyph">⌑</span>' : ''}</button>`);
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
      const role = `LVL ${player.level} · ${player.className === 'Rogue' ? `Rogue · ${player.subclass || player.disguiseClass + ' guise'}` : `${player.subclass ? `${player.subclass} · ` : ''}${D.CLASSES[player.className]?.role || player.className}`}`;
      const connectedState = connected.includes(player.id) ? 'online' : '';
      return `<div class="party-member ${player.id === state.playerId ? 'current' : ''} ${player.dead ? 'fallen' : ''}"><div class="avatar" style="color:${color}">${icons[player.className] || '●'}</div><div><div class="member-name">${escapeHtml(player.name)} ${player.id === state.playerId ? '<span class="you-tag">YOU</span>' : ''}${player.id === game.hostId ? '<span class="host-tag">HOST</span>' : ''}<i class="connection-state ${connectedState}" title="${connectedState ? 'Online' : 'Reconnecting'}"></i></div><div class="member-class">${escapeHtml(role)}${player.dead ? ' · FALLEN' : ''}</div></div><div class="member-hp"><span class="hp-text">${player.hp}/${player.maxHp} HP</span><div class="hp-track"><i class="${hpWidth < 35 ? 'low' : ''}" style="width:${hpWidth}%"></i></div>${player.guard ? `<div class="member-guard">◈ ${player.guard} guard</div>` : ''}</div></div>`;
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

  function renderHand(game, me) {
    const panel = $('#hand-panel');
    if (!me || game.phase !== 'battle') { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    $('#hand-count').textContent = `${me.hand.length} / ${me.handSize || 3}`;
    $('#hand-cards').innerHTML = me.hand.length ? me.hand.map((card) => {
      const selected = state.selectedCard === card.uid;
      const flip = me.className === 'Rogue' && card.unique;
      const variant = state.flipped && selected && flip ? flippedCard(card) : null;
      return `<button class="card ${card.category} ${selected ? 'selected' : ''} ${variant ? 'flipped' : ''}" data-card="${card.uid}"><span class="card-name">${escapeHtml(variant?.name || card.name)}</span><span class="card-category">${escapeHtml(card.category)}${card.upgraded ? ' · EVOLVED' : ''}</span><span class="card-text">${escapeHtml(variant?.text || card.text)}</span><span class="card-bottom">${card.outOfTurn ? '<span class="card-out">↗ REACTION</span>' : '<span></span>'}<span class="card-pips">${Array.from({ length: Math.max(1, card.category === 'attack' ? card.effect.damage || 1 : card.category === 'defense' ? card.effect.shield || 1 : card.effect.move || 1) }).slice(0, 4).map(() => '<i></i>').join('')}</span></span>${flip ? `<span class="flip-mark" data-flip="${card.uid}">${variant ? 'UNFLIP' : 'FLIP'}</span>` : ''}</button>`;
    }).join('') : '<div class="empty-hand">Your hand is empty. End your turn and your draw pile will refill it.</div>';
    $('#hand-cards').querySelectorAll('.card').forEach((node) => node.addEventListener('click', (event) => {
      const card = me.hand.find((held) => held.uid === node.dataset.card); if (!card) return;
      if (event.target.dataset.flip) { if (state.selectedCard !== card.uid) { state.selectedCard = card.uid; state.flipped = true; } else state.flipped = !state.flipped; render(); return; }
      if (state.selectedCard === card.uid) { state.selectedCard = null; state.flipped = false; render(); return; }
      state.selectedCard = card.uid; state.flipped = false;
      const targetRequired = card.category === 'movement' || card.category === 'attack' || card.effect.damage || card.effect.debuff || card.effect.taunt || card.effect.heal || card.effect.target === 'ally' || (me.className === 'Rogue' && state.flipped && card.category === 'skill');
      if (!targetRequired) { act('play', { cardId: card.uid }); state.selectedCard = null; }
      render();
    }));
  }

  function renderReward(game, me) {
    const panel = $('#reward-panel');
    if (game.phase !== 'reward' || !me || !game.reward) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    const choice = game.reward.choices[me.id];
    if (!choice) { panel.innerHTML = '<p>Reward choices unavailable. Reconnect to continue.</p>'; return; }
    const subclassPrompt = choice.subclassOptions?.length;
    const claimedByMe = game.reward.items.some((item) => item.claimedBy === me.id);
    const myAbility = me.abilities.at(-1);
    let abilityMarkup = '';
    if (choice.abilityChosen) abilityMarkup = `<div class="reward-choice">✦ You chose <strong>${escapeHtml(myAbility?.name || 'an ability')}</strong>. ${escapeHtml(myAbility?.text || '')}</div>`;
    else abilityMarkup = `<div class="reward-options">${choice.abilityOptions.map((offer) => `<button class="reward-option" data-ability="${escapeHtml(offer.id)}"><b>${escapeHtml(offer.name)}</b><p>${escapeHtml(offer.text)}</p></button>`).join('')}</div>`;
    const subclassMarkup = subclassPrompt ? `<div class="reward-section-title">ROOM 6 · CHOOSE YOUR PATH</div><div class="reward-options">${choice.subclassOptions.map((name) => `<button class="reward-option subclass-option" data-subclass="${escapeHtml(name)}"><b>${escapeHtml(name)}</b><p>${escapeHtml(subclassText(name))}</p></button>`).join('')}</div>` : '';
    const offers = game.reward.items.map((item) => {
      const done = !!item.claimedBy;
      const who = item.claimedBy === 'left' ? 'LEFT FOR NOW' : item.claimedBy ? `CLAIMED BY ${escapeHtml(game.players.find((p) => p.id === item.claimedBy)?.name || 'A HERO')}` : 'SHARED DROP';
      return `<div class="reward-item ${done ? 'claimed' : ''}"><b>${escapeHtml(item.name)}</b><p>${escapeHtml(item.text)}</p>${done ? `<span class="member-class">${who}</span>` : `<div class="reward-item-actions"><button data-claim="${item.slot}" ${claimedByMe ? 'disabled' : ''}>${claimedByMe ? 'ONE ITEM EACH' : 'TAKE ITEM'}</button><button data-skip="${item.slot}">LEAVE IT</button></div>`}</div>`;
    }).join('');
    const ready = choice.ready;
    panel.innerHTML = `<div class="reward-title">Room ${game.roomState.room} cleared.</div><p class="reward-subtitle">You grow after every room. Choose a passive and help share the crew’s item draft.</p>${subclassMarkup}<div class="reward-section-title">YOUR NEW ABILITY</div>${abilityMarkup}<div class="reward-section-title">PARTY ITEMS · ${game.reward.items.length} AVAILABLE</div><div class="reward-items">${offers || '<span class="member-class">No items this room.</span>'}</div><div class="reward-footer"><p>${ready ? 'You are ready. Waiting for the rest of the crew.' : 'Your class deck and passives stay with you between rooms.'}</p><button id="ready-reward" class="button button-primary" ${!choice.abilityChosen || subclassPrompt || ready ? 'disabled' : ''}>${ready ? 'READY' : 'READY FOR NEXT ROOM'} <span>↗</span></button></div>`;
    panel.querySelectorAll('[data-ability]').forEach((button) => button.addEventListener('click', () => act('chooseAbility', { abilityId: button.dataset.ability })));
    panel.querySelectorAll('[data-subclass]').forEach((button) => button.addEventListener('click', () => act('chooseSubclass', { subclass: button.dataset.subclass })));
    panel.querySelectorAll('[data-claim]').forEach((button) => button.addEventListener('click', () => act('claimItem', { slot: Number(button.dataset.claim) })));
    panel.querySelectorAll('[data-skip]').forEach((button) => button.addEventListener('click', () => act('skipItem', { slot: Number(button.dataset.skip) })));
    $('#ready-reward')?.addEventListener('click', () => act('readyReward'));
  }

  function subclassText(name) {
    const text = { Archmage: 'Turn wide spells into devastating room control.', Arcanist: 'Lean into tricks, utility, and a larger hand.', Mender: 'Make healing and protection reach further.', Hexweaver: 'Let curses spread and drain the castle.', Warlord: 'Hold the line and rally everyone around you.', Reaver: 'Turn sweeping attacks into stolen life.', Deadeye: 'Make each precise shot count.', Windstalker: 'Move freely and leave enemies tangled.', Duelist: 'Commit to one foe and win the exchange.', 'Bounty Hunter': 'Isolate a target and cut off escape.', Sentinel: 'Protect the crew with heavier guard.', Justiciar: 'Turn shield shoves into punishment.', Assassin: 'Strike first from the shadows.', Thief: 'Slip past the guards and make the relic yours.' };
    return text[name] || 'Evolve your unique cards toward a sharper focus.';
  }

  function renderEscape(game, me) {
    const panel = $('#escape-panel');
    if (game.phase !== 'escape' || !me) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    const escaped = me.escaped;
    const exit = game.roomState.exit;
    const distance = Math.abs(me.x - exit.x) + Math.abs(me.y - exit.y);
    panel.innerHTML = `<div class="panel-kicker">FINAL ROOM · GET OUT</div><h2>${me.artifact ? 'The relic is in your hands.' : 'The vault is behind you.'}</h2><p>${me.className === 'Rogue' && me.artifact ? 'Make it to the gate alone to win the heist.' : 'Move one tile at a time. Any living crew member can reach the gate to carry the crew’s escape.'}</p><div class="escape-status">${escaped ? 'YOU ARE THROUGH THE GATE.' : distance === 0 ? 'YOU ARE ON THE GATE. Claim the escape.' : `${distance} TILE${distance === 1 ? '' : 'S'} TO THE RED GATE.`}</div>${distance === 0 && !escaped ? '<button class="button button-primary" id="claim-escape">ESCAPE WITH THE RELIC ↗</button>' : ''}`;
    $('#claim-escape')?.addEventListener('click', () => act('escape'));
    $('#escape-step').classList.toggle('hidden', escaped);
  }

  function renderActions(game, me) {
    if (!me || game.phase !== 'battle') { $('#end-turn').classList.add('hidden'); $('#steal-artifact').classList.add('hidden'); }
    else {
      const end = $('#end-turn'); end.classList.remove('hidden'); end.disabled = me.ended || me.dead;
      end.textContent = me.ended ? 'WAITING FOR CREW' : 'END TURN ↗';
      $('.turn-caption span:last-child').textContent = me.dead ? 'You have fallen.' : me.ended ? 'Waiting for the crew.' : `${Math.max(0, 2 - me.played)} card${2 - me.played === 1 ? '' : 's'} left this turn`;
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

  async function copyInvite() {
    const url = `${location.origin}${location.pathname}?room=${state.roomCode}`;
    try { await navigator.clipboard.writeText(url); showToast('Invite link copied. Send it to your crew.'); }
    catch { showToast(`Room code ${state.roomCode} — share it with your crew.`); }
  }

  function openRules() { $('#rules').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeRules() { $('#rules').classList.add('hidden'); document.body.style.overflow = ''; }

  fillClassSelect();
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

