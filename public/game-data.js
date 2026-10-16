(function (root, factory) {
  const data = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  root.CrownfallData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CLASS_ORDER = ['Wizard', 'Weaver', 'Barbarian', 'Ranger', 'Swordsman', 'Knight'];
  const CLASSES = {
    Wizard: { icon: '✧', hp: 8, color: '#a78bd2', role: 'Spell slinger', passive: 'Unique spell attacks gain +1 range. Once per round, the first spell that hits an enemy also hits one other foe beside it.' },
    Weaver: { icon: '❋', hp: 10, color: '#7bbfa9', role: 'Mender & hexer', passive: 'Healing restores +1 HP; when you heal an ally, gain 1 guard.' },
    Barbarian: { icon: '⚒', hp: 16, color: '#d57955', role: 'Front-line breaker', passive: 'Reduce the first damage you take each round by 1.' },
    Ranger: { icon: '➶', hp: 9, color: '#94ad65', role: 'Mobile marksman', passive: 'Ranged attacks gain +1 range; your first move each round goes 1 tile farther.' },
    Swordsman: { icon: '⚔', hp: 11, color: '#d7ae67', role: 'Duelist', passive: 'Hit the same foe twice in one round to deal +2 damage on the second hit.' },
    Knight: { icon: '⬟', hp: 14, color: '#8eaac2', role: 'Shield & control', passive: 'Your guard lasts through the enemy turn; enemies you push deal 1 less damage next turn.' }
  };

  const effectCategory = (effect, fallback) => {
    if (effect.damage || effect.push || effect.splash || effect.lifesteal) return 'attack';
    if (effect.shield || effect.cancelRanged || effect.redirect || effect.evade || effect.unpushable) return 'defense';
    if (effect.heal || effect.debuff || effect.buff || effect.draw || effect.taunt || effect.cleanse) return 'skill';
    if (effect.move) return 'movement';
    return fallback;
  };
  const C = (id, name, category, text, effect, extra = {}) => ({ id, name, category: effectCategory(effect, category), text, effect: { ...effect }, copies: 3, ...extra });
  const DECKS = {
    Wizard: [
      C('warding-flash', 'Warding Flash', 'defense', 'Gain 2 Guard.', { shield: 2 }, { copies: 1 }),
      C('spell-turn', 'Arcane Guard', 'defense', 'Gain 3 Guard.', { shield: 3 }, { copies: 1 }),
      C('arcane-snap', 'Arcane Snap', 'attack', 'Deal 2 damage. Range 3.', { damage: 2, range: 3 }, { copies: 1 }),
      C('runic-feint', 'Runic Feint', 'skill', 'Weaken a foe. Range 3.', { debuff: 'weak', range: 3 }, { copies: 1 }),
      C('last-spark', 'Last Spark', 'defense', 'Give an ally 2 Guard. Range 4.', { shield: 2, range: 4, target: 'ally' }, { copies: 1 }),
      C('fire-bolt', 'Fire Bolt', 'attack', 'Deal 3 damage. Range 4.', { damage: 3, range: 4 }),
      C('frost-ring', 'Frost Ring', 'attack', 'Deal 2 damage and weaken foes within 1 tile of your target.', { damage: 2, range: 2, splash: 1, debuff: 'slow' }),
      C('witchfire', 'Witchfire', 'attack', 'Deal 2 damage and weaken a foe. Range 3.', { damage: 2, range: 3, debuff: 'weak' }),
      C('spark-ward', 'Spark Ward', 'defense', 'Gain 3 guard. The next attacker takes 1 damage.', { shield: 3, thorns: 1 }),
      C('arcane-lore', 'Arcane Lore', 'skill', 'Draw 2 cards.', { draw: 2 })
    ],
    Weaver: [
      C('thread-snare', 'Thread Snare', 'skill', 'Weaken a foe. Range 4.', { debuff: 'weak', range: 4 }, { copies: 1 }),
      C('quick-stitch', 'Quick Stitch', 'skill', 'Heal an ally 2 HP. Range 4.', { heal: 2, range: 4, target: 'ally' }, { copies: 1 }),
      C('woven-aegis', 'Woven Aegis', 'defense', 'Give an ally 3 Guard. Range 3.', { shield: 3, range: 3, target: 'ally' }, { copies: 1 }),
      C('shared-breath', 'Shared Breath', 'skill', 'Heal an ally 3 HP. Range 4.', { heal: 3, range: 4, target: 'ally' }, { copies: 1 }),
      C('thorn-thread', 'Thorn Thread', 'attack', 'Deal 2 damage. Range 4.', { damage: 2, range: 4 }, { copies: 1 }),
      C('mending-thread', 'Mending Thread', 'skill', 'Heal an ally 3 HP. Range 4.', { heal: 3, range: 4, target: 'ally' }),
      C('bright-knot', 'Bright Knot', 'skill', 'Give an ally +1 damage and 2 guard.', { buff: 'fury', shield: 2, range: 4, target: 'ally' }),
      C('thorn-tether', 'Thorn Tether', 'attack', 'Deal 1 damage and weaken a foe. Range 4.', { damage: 1, range: 4, debuff: 'weak' }),
      C('soft-landing', 'Soft Landing', 'defense', 'Give yourself or an ally 3 guard. Range 3.', { shield: 3, range: 3, target: 'ally' }),
      C('threaded-ward', 'Threaded Ward', 'skill', 'Cleanse an ally and give them 1 Guard. Range 3.', { cleanse: 1, shield: 1, range: 3, target: 'ally' })
    ],
    Barbarian: [
      C('stand-between', 'Stone Stance', 'defense', 'Gain 2 Guard.', { shield: 2 }, { copies: 1 }),
      C('iron-reflex', 'Iron Reflex', 'defense', 'Gain 4 Guard.', { shield: 4 }, { copies: 1 }),
      C('blood-roar', 'Blood Roar', 'skill', 'Taunt a foe and weaken it. Range 3.', { taunt: 2, debuff: 'weak', range: 3 }, { copies: 1 }),
      C('reaver-counter', 'Reaver Counter', 'attack', 'Deal 3 damage. Range 1.', { damage: 3, range: 1 }, { copies: 1 }),
      C('last-stand', 'Last Stand', 'defense', 'Gain 4 Guard.', { shield: 4 }, { copies: 1 }),
      C('wide-cleave', 'Wide Cleave', 'attack', 'Deal 3 damage to a foe and 1 to adjacent foes.', { damage: 3, range: 1, splash: 1, splashDamage: 1 }),
      C('shoulder-rush', 'Shoulder Rush', 'attack', 'Charge up to 2 tiles, then deal 2 damage and push 1. Maximum reach 3.', { damage: 2, range: 1, move: 2, push: 1, charge: true }),
      C('war-cry', 'War Cry', 'skill', 'Taunt foes within 3 tiles and gain 2 guard.', { taunt: 3, shield: 2, range: 3 }),
      C('iron-hide', 'Iron Hide', 'defense', 'Gain 4 guard.', { shield: 4 }),
      C('rending-arc', 'Rending Arc', 'attack', 'Deal 2 damage to a foe and 1 to foes within 1 tile of it.', { damage: 2, range: 1, splash: 1, splashDamage: 1 })
    ],
    Ranger: [
      C('sidestep', 'Canny Guard', 'defense', 'Gain 2 Guard.', { shield: 2 }, { copies: 1 }),
      C('catch-arrow', 'Catch the Arrow', 'attack', 'Gain 4 Guard and deal 2 damage. Range 5.', { shield: 4, damage: 2, range: 5 }, { copies: 1 }),
      C('covering-shot', 'Covering Shot', 'attack', 'Deal 2 damage. Range 5.', { damage: 2, range: 5 }, { copies: 1 }),
      C('fox-trap', 'Fox Trap', 'attack', 'Deal 1 damage and root a foe. Range 1.', { damage: 1, range: 1, debuff: 'root' }, { copies: 1 }),
      C('parting-shot', 'Measured Shot', 'attack', 'Deal 2 damage. Range 5.', { damage: 2, range: 5 }, { copies: 1 }),
      C('longshot', 'Longshot', 'attack', 'Deal 3 damage. Range 5.', { damage: 3, range: 5 }),
      C('pinning-arrow', 'Pinning Arrow', 'attack', 'Deal 2 damage and root a foe. Range 4.', { damage: 2, range: 4, debuff: 'root' }),
      C('serrated-shot', 'Serrated Shot', 'attack', 'Deal 2 damage and weaken a foe. Range 5.', { damage: 2, range: 5, debuff: 'weak' }),
      C('fieldcraft', 'Fieldcraft', 'skill', 'Gain 2 guard and draw 1 card.', { shield: 2, draw: 1 }),
      C('marked-prey', 'Marked Prey', 'skill', 'Mark a foe; your next attack deals +2 damage. Range 5.', { debuff: 'marked', range: 5 })
    ],
    Swordsman: [
      C('riposte', 'Riposte', 'attack', 'Gain 2 Guard and deal 3 damage. Range 1.', { shield: 2, damage: 3, range: 1 }, { copies: 1 }),
      C('lunge-counter', 'Lunge', 'attack', 'Deal 2 damage. Range 2.', { damage: 2, range: 2 }, { copies: 1 }),
      C('measured-guard', 'Measured Guard', 'defense', 'Gain 3 Guard.', { shield: 3 }, { copies: 1 }),
      C('passing-cut', 'Passing Cut', 'attack', 'Deal 2 damage. Range 1.', { damage: 2, range: 1 }, { copies: 1 }),
      C('perfect-parry', 'Perfect Parry', 'defense', 'Gain 4 Guard and draw 1 card.', { shield: 4, draw: 1 }, { copies: 1 }),
      C('precise-cut', 'Precise Cut', 'attack', 'Deal 3 damage to one foe. Range 1.', { damage: 3, range: 1 }),
      C('sword-lesson', 'Read the Guard', 'skill', 'Mark a foe and draw 1 card. Range 3.', { debuff: 'marked', range: 3, draw: 1, target: 'enemy' }),
      C('close-parry', 'Close Parry', 'defense', 'Gain 2 Guard and +1 damage on your next attack.', { shield: 2, buff: 'fury' }),
      C('guarded-form', 'Guarded Form', 'defense', 'Gain 2 guard and +1 damage on your next attack.', { shield: 2, buff: 'fury' }),
      C('finishing-line', 'Finishing Line', 'attack', 'Deal 4 damage to a foe with half HP or less.', { damage: 4, range: 1, bonusVsWounded: true })
    ],
    Knight: [
      C('shield-wall', 'Shield Wall', 'defense', 'Give an adjacent ally 4 Guard.', { shield: 4, target: 'ally', range: 1 }, { copies: 1 }),
      C('bulwark-step', 'Bulwark Step', 'defense', 'Give an ally 2 Guard. Range 3.', { shield: 2, target: 'ally', range: 3 }, { copies: 1 }),
      C('shield-retort', 'Shield Retort', 'attack', 'Deal 2 damage and push a foe 1 tile. Range 1.', { damage: 2, range: 1, push: 1 }, { copies: 1 }),
      C('unyielding', 'Unyielding', 'defense', 'Gain 2 Guard.', { shield: 2 }, { copies: 1 }),
      C('vow-of-cover', 'Vow of Cover', 'skill', 'Taunt a foe. Range 4.', { taunt: 2, range: 4 }, { copies: 1 }),
      C('shield-bash', 'Shield Bash', 'attack', 'Deal 2 damage, push a foe 2 tiles and daze it. Range 1.', { damage: 2, range: 1, push: 2, debuff: 'daze' }),
      C('linebreaker', 'Linebreaker', 'attack', 'Deal 2 damage and push up to 2 foes 1 tile.', { damage: 2, range: 1, splash: 1, push: 1 }),
      C('brace', 'Brace', 'defense', 'Gain 4 guard; cannot be pushed this round.', { shield: 4, unpushable: true }),
      C('challenge', 'Challenge', 'skill', 'Taunt a foe within 4 tiles and weaken it.', { taunt: 4, debuff: 'weak', range: 4 }),
      C('shield-hook', 'Shield Hook', 'attack', 'Deal 2 damage and push a foe 1 tile. Range 1.', { damage: 2, range: 1, push: 1 })
    ]
  };

  const ABILITIES = {
    Wizard: [
      ['Deep Reserves', 'Start each room with 1 guard.', 'guard', 1], ['Quick Study', 'Draw 1 extra card each turn.', 'hand', 1], ['Long Reach', '+1 range on your attacks.', 'range', 1], ['Careful Casting', 'Your first attack each round deals +1 damage.', 'damage', 1], ['Blink Reflex', 'When attacked, blink 1 tile if one is open.', 'evade', 1],
      ['Spell Shield', 'The first spell damage you take each round is reduced by 2.', 'shield', 2], ['Kindled Mind', 'After you play a skill, gain 1 guard.', 'skillGuard', 1], ['Arcane Echo', 'On a kill, return 1 discarded spell to your hand.', 'killDraw', 1], ['Wider Circle', 'Your splash effects reach 1 extra tile.', 'splash', 1], ['Calm Focus', 'Keep +1 card at turn end.', 'hand', 1],
      ['Emergency Ward', 'When below half HP, gain 2 guard.', 'lowHpGuard', 2], ['Charged Bolt', '+1 damage against enemies with a debuff.', 'debuffDamage', 1], ['Fleet Thought', 'Your first move each turn gains +1 tile.', 'move', 1], ['Battle Savant', 'Draw 1 card after the first boss appears.', 'bossDraw', 1], ['Lasting Hex', 'Debuffs you apply last one extra round.', 'debuff', 1]
    ],
    Weaver: [
      ['Gentle Hands', 'All healing restores +1 HP.', 'heal', 1], ['Shared Thread', 'Healing an ally gives you 1 guard.', 'healGuard', 1], ['Far Stitch', '+1 range on ally skills.', 'range', 1], ['Warmth', 'Start each room with 1 guard.', 'guard', 1], ['Steady Pulse', 'When you end a turn, heal the most wounded ally 1.', 'steadyPulse', 1],
      ['Mending Surge', 'All healing restores +2 HP.', 'heal', 2], ['Knotted Fate', 'First foe you debuff each round deals 1 less damage.', 'debuffDamage', 1], ['Open Weave', 'Draw 1 card when you heal an ally.', 'healDraw', 1], ['Tangled Ground', 'Rooted foes deal 1 less damage.', 'rootGuard', 1], ['Rescue Line', 'Once per room, save an ally from a lethal hit at 1 HP.', 'rescue', 1],
      ['Patient Weaver', 'Gain 1 guard when ending a turn with cards in hand.', 'endHandGuard', 1], ['Bright Pattern', 'Ally buffs last one extra round.', 'buffDuration', 1], ['Dispel Thread', 'Cleanse one extra debuff.', 'cleanse', 1], ['Reprieve', 'Revive a fallen ally once per run at 3 HP.', 'revive', 3], ['Vital Knot', 'Your healing can exceed max HP by 2 as guard.', 'overflowGuard', 2]
    ],
    Barbarian: [
      ['Hard to Kill', '+2 maximum HP.', 'maxHp', 2], ['Thick Hide', 'Reduce the first hit each round by 1.', 'reduction', 1], ['Heavy Swing', 'Your attacks deal +1 damage at range 1.', 'meleeDamage', 1], ['Blood Scent', 'Heal 1 HP when you defeat an enemy.', 'killHeal', 1], ['Battle Cry', 'Taunted foes deal 1 less damage.', 'tauntGuard', 1],
      ['Shoulder In', 'Pushes move foes 1 extra tile.', 'push', 1], ['Unbroken', 'Start a room with 2 guard.', 'guard', 2], ['Red Recovery', 'Heal 2 HP after a boss fight.', 'bossHeal', 2], ['Cornered Beast', 'At half HP or less, deal +1 damage.', 'lowHpDamage', 1], ['Fierce Taunt', 'Taunt reaches 1 tile farther.', 'taunt', 1],
      ['Rallying Roar', 'On a kill, each other ally gains 1 guard.', 'teamKillGuard', 1], ['Thirst for Battle', 'Heal 1 after your first attack each round.', 'attackHeal', 1], ['Sure Footed', 'Ignore slow and root once per round.', 'cleanse', 1], ['Iron Temper', '+1 damage reduction while guarding.', 'reduction', 1], ['Last Breath', 'Once per run, survive a lethal hit at 1 HP.', 'rescue', 1]
    ],
    Ranger: [
      ['Eagle Eye', '+1 range on ranged attacks.', 'range', 1], ['Light Step', 'Your first move each turn gains +1 tile.', 'move', 1], ['Marked Shot', 'Deal +1 damage to marked foes.', 'debuffDamage', 1], ['Roll Away', 'The first ranged attack against you each round misses.', 'evade', 1], ['Field Rations', 'Start each room with 1 guard.', 'guard', 1],
      ['Quick Draw', 'Draw 1 card on your first ranged hit each round.', 'hitDraw', 1], ['Longstride', '+1 movement.', 'move', 1], ['Clean Shot', 'Deal +1 damage if no foe is adjacent.', 'damage', 1], ['Trapwise', 'Rooted foes take 1 damage at turn end.', 'rootDamage', 1], ['Skirmisher', 'After a kill, move 1 tile for free.', 'killMove', 1],
      ['Tactical Retreat', 'When hit, gain 1 guard and move 1 tile.', 'evade', 1], ['True Aim', 'Attacks ignore 1 guard.', 'pierce', 1], ['Trailblazer', 'Discarding a card to move gains +1 tile.', 'move', 1], ['Poisoned Tip', 'Your first debuff each round deals 1 damage.', 'debuffDamage', 1], ['Last Arrow', 'At 1 HP, your attacks deal +2 damage.', 'lowHpDamage', 2]
    ],
    Swordsman: [
      ['Single Out', 'Deal +1 damage to the foe you last attacked.', 'focus', 1], ['Riposte Form', 'Gain 1 guard after a parry.', 'riposteGuard', 1], ['Measured Step', 'Move +1 tile when closing on a wounded foe.', 'move', 1], ['Blade Discipline', 'Your first attack each turn costs no hand card once per room.', 'freeAttack', 1], ['Read the Guard', 'Deal +1 damage to guarded foes.', 'pierce', 1],
      ['Duelist’s Poise', 'Take 1 less damage from your focused foe.', 'reduction', 1], ['Finish the Exchange', 'Second hit on a foe each round deals +2 damage.', 'focus', 2], ['Quick Feint', 'First attack against you each round grants 1 guard.', 'firstAttackGuard', 1], ['Pursuit', 'After attacking a wounded foe, move 1 tile toward it.', 'move', 1], ['Crosscut', 'Your attacks can hit one adjacent foe for 1 damage.', 'crosscut', 1],
      ['Perfect Timing', 'Draw 1 after defeating your focused foe.', 'killDraw', 1], ['Steady Hand', '+1 damage at range 1.', 'meleeDamage', 1], ['Open Guard', 'Your second hit each turn weakens the foe.', 'openGuard', 1], ['Footwork', 'When hit, sidestep 1 tile.', 'evade', 1], ['Unbroken Focus', 'Keep your focus across room transitions.', 'focus', 1]
    ],
    Knight: [
      ['Iron Wall', 'Reduce damage to adjacent allies by 1.', 'allyGuard', 1], ['Cannot Be Moved', 'You cannot be pushed.', 'unpushable', 1], ['Broad Shield', '+1 guard from defense cards.', 'shield', 1], ['Long Reach', 'Your pushes travel +1 tile.', 'push', 1], ['Hold the Line', 'Adjacent enemies deal 1 less damage.', 'reduction', 1],
      ['Shield Lessons', 'Your first defense each round also deals 1 damage to adjacent foes.', 'thorns', 1], ['Guardian’s Oath', 'When an ally is hurt, gain 1 guard.', 'allyHurtGuard', 1], ['Driving Bash', 'Push or daze also weakens the target.', 'pushWeaken', 1], ['Stand Fast', 'Start each room with 2 guard.', 'guard', 2], ['Bodyguard', 'Redirect the first adjacent ally hit each room.', 'redirect', 1],
      ['Formation', 'Adjacent allies gain 1 guard at turn end.', 'allyGuard', 1], ['Shield Ram', 'Deal +1 damage to foes you push.', 'pushDamage', 1], ['Immovable', 'Reduce boss damage by 1.', 'reduction', 1], ['Vigilance', 'Draw 1 when you guard an ally.', 'allyDraw', 1], ['Last Bastion', 'Once per run, block all damage from one hit.', 'rescue', 1]
    ]
  };

  const ITEMS = [
    { id: 'tonic', name: 'Grave Tonic', kind: 'consumable', text: 'Heal 4 HP.', effect: { heal: 4 } },
    { id: 'smoke-vial', name: 'Ashen Shroud', kind: 'consumable', text: 'Gain 5 guard; your next move gains 2 extra tiles.', effect: { shield: 5, move: 2 } },
    { id: 'fire-oil', name: 'Necrotic Oil', kind: 'consumable', text: 'Your next attack deals +3 damage.', effect: { buff: 'nextAttack', buffPower: 3 } },
    { id: 'salt-pouch', name: 'Grave Salt', kind: 'consumable', text: 'Deal 3 damage and cleanse a curse.', effect: { damage: 3, range: 3, cleanse: 1 } },
    { id: 'iron-charm', name: 'Ossuary Saint Charm', kind: 'permanent', text: 'Start each fight with 2 guard. Knights gain 1 more.', effect: { startGuard: 2 }, classBonus: { Knight: 1 } },
    { id: 'raven-ring', name: 'Bone Raven Ring', kind: 'permanent', text: '+1 card each turn. Wizards draw one extra.', effect: { hand: 1 }, classBonus: { Wizard: 1 } },
    { id: 'wolf-cloak', name: 'Pale Hound Shroud', kind: 'permanent', text: '+1 movement; Rangers gain +1 more.', effect: { move: 1 }, classBonus: { Ranger: 1 } },
    { id: 'red-belt', name: 'Bloodied War Sash', kind: 'permanent', text: '+1 attack damage. Barbarians heal 1 on a kill.', effect: { damage: 1 }, classBonus: { Barbarian: 1 } },
    { id: 'needle', name: 'Graveweaver Needle', kind: 'permanent', text: 'Healing +1; Weavers draw a card on every heal.', effect: { heal: 1 }, classBonus: { Weaver: 1 } },
    { id: 'duel-glove', name: 'Bone Duelist’s Glove', kind: 'permanent', text: 'Deal +1 to your focused foe. Swordsmen gain +1 more.', effect: { focusDamage: 1 }, classBonus: { Swordsman: 1 } },
    { id: 'tower-shield', name: 'Ossuary Tower Shield', kind: 'permanent', text: '+2 guard from defense cards. Knights cannot be pushed.', effect: { shield: 2 }, classBonus: { Knight: 1 } },
    { id: 'fox-coin', name: 'Black Coin', kind: 'permanent', text: 'Draw a card when you defeat an enemy.', effect: { killDraw: 1 } }
  ];

  const MODIFIERS = [
    { id: 'moon-slit', name: 'Grave-Light Slits', buff: 'Players have +1 range.', debuff: 'Only 1 attack card per player per turn.', hero: { range: 1 }, rule: 'limit_attack' },
    { id: 'old-favor', name: 'The Keep Remembers', buff: 'The first ally heal each round restores +2.', debuff: 'The first enemy attack each round deals +1.', enemy: { damage: 1 }, rule: 'favor' },
    { id: 'echoing-hall', name: 'Whispering Bones', buff: 'Hand size +1.', debuff: 'Only one card of each type per turn.', hero: { hand: 1 }, rule: 'one_category' },
    { id: 'loose-stone', name: 'Shifting Barrow Stones', buff: 'Pushes deal +2 damage.', debuff: 'Discard moves lose 1 tile (minimum 1).', hero: { pushDamage: 2 }, rule: 'rough_move' },
    { id: 'lantern-tax', name: 'Soul-Starved Dark', buff: 'Room-clear healing restores 2 HP.', debuff: 'The party begins this room with 1 less card.', rule: 'dim_start' },
    { id: 'red-rain', name: 'Necrotic Drizzle', buff: 'Attacks deal +1 damage.', debuff: 'Healing is reduced by 1.', hero: { damage: 1 }, rule: 'blood-price' }
  ];

  const ENEMY_NAMES = {
    1: ['Skeletal Guard', 'Skeletal Soldier', 'Bone Archer', 'Zombie Hound'],
    2: ['Skeletal Soldier', 'Bone Archer', 'Zombie Hound', 'Skeletal Horse'],
    3: ['Skeletal Guard', 'Skeletal Horse', 'Bone Archer', 'Skeletal Soldier'],
    4: ['Zombie Hound', 'Skeletal Soldier', 'Skeletal Horse', 'Bone Archer'],
    5: ['Bone Archer', 'Skeletal Soldier', 'Skeletal Horse', 'Zombie Hound'],
    6: ['Giant Skeleton King', 'Skeletal Guard', 'Bone Archer', 'Zombie Hound']
  };

  const getAbilityList = (className) => ABILITIES[className] || [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return { CLASS_ORDER, CLASSES, DECKS, ABILITIES, ITEMS, MODIFIERS, ENEMY_NAMES, getAbilityList, clone };
});

