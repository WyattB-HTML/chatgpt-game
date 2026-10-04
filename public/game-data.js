(function (root, factory) {
  const data = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  root.CrownfallData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CLASS_ORDER = ['Wizard', 'Weaver', 'Barbarian', 'Ranger', 'Swordsman', 'Knight'];
  const CLASSES = {
    Wizard: { icon: '✧', hp: 8, color: '#a78bd2', role: 'Spell slinger', passive: 'Once per round, the first spell that hits an enemy also hits one other foe beside it.' },
    Weaver: { icon: '❋', hp: 10, color: '#7bbfa9', role: 'Mender & hexer', passive: 'Healing restores +1 HP; when you heal an ally, gain 1 guard.' },
    Barbarian: { icon: '⚒', hp: 16, color: '#d57955', role: 'Front-line breaker', passive: 'Reduce the first damage you take each round by 1.' },
    Ranger: { icon: '➶', hp: 9, color: '#94ad65', role: 'Mobile marksman', passive: 'Ranged attacks gain +1 range; your first move each round goes 1 tile farther.' },
    Swordsman: { icon: '⚔', hp: 11, color: '#d7ae67', role: 'Duelist', passive: 'Hit the same foe twice in one round to deal +2 damage on the second hit.' },
    Knight: { icon: '⬟', hp: 14, color: '#8eaac2', role: 'Shield & control', passive: 'Your guard lasts through the enemy turn; enemies you push deal 1 less damage next turn.' },
    Rogue: { icon: '♠', hp: 10, color: '#cf7e85', role: 'Hidden saboteur', passive: 'Disguise as an unused class. Flip any class card into a sly Rogue trick.' }
  };

  const effectCategory = (effect, fallback) => {
    if (effect.damage || effect.push || effect.splash || effect.lifesteal) return 'attack';
    if (effect.shield || effect.cancelRanged || effect.redirect || effect.evade || effect.unpushable) return 'defense';
    if (effect.heal || effect.debuff || effect.buff || effect.draw || effect.taunt || effect.cleanse || effect.stealItem) return 'skill';
    if (effect.move) return 'movement';
    return fallback;
  };
  const C = (id, name, category, text, effect, extra = {}) => ({ id, name, category: effectCategory(effect, category), text, effect: { ...effect }, copies: 3, ...extra });
  const RE = (id, name, category, text, effect, response, extra = {}) => ({ id, name, category: effectCategory(effect, category), text, effect: { ...effect }, copies: 1, outOfTurn: true, response, ...extra });
  const DECKS = {
    Wizard: [
      RE('warding-flash', 'Warding Flash', 'defense', 'When you are attacked: prevent 2 damage.', { shield: 2 }, 'self_attacked'),
      RE('spell-turn', 'Spellturn', 'skill', 'When an ally is hit by a ranged attack: cancel it.', { cancelRanged: true }, 'ally_ranged_hit'),
      RE('arcane-snap', 'Arcane Snap', 'attack', 'When a foe enters your row: deal 2 damage at range 3.', { damage: 2, range: 3 }, 'enemy_moves'),
      RE('mirror-step', 'Mirror Step', 'movement', 'When attacked: blink 2 tiles away.', { move: 2 }, 'self_attacked'),
      RE('last-spark', 'Last Spark', 'skill', 'When an ally falls below half HP: give them 2 guard.', { shield: 2 }, 'ally_low_hp'),
      C('fire-bolt', 'Fire Bolt', 'attack', 'Deal 3 damage. Range 4.', { damage: 3, range: 4 }),
      C('frost-ring', 'Frost Ring', 'attack', 'Deal 2 damage and weaken nearby foes.', { damage: 2, range: 2, splash: 1, debuff: 'slow' }),
      C('blink', 'Blink', 'movement', 'Teleport up to 3 tiles; pass through walls.', { move: 3, teleport: true }),
      C('spark-ward', 'Spark Ward', 'defense', 'Gain 3 guard. The next attacker takes 1 damage.', { shield: 3, thorns: 1 }),
      C('arcane-lore', 'Arcane Lore', 'skill', 'Draw 2 cards.', { draw: 2 })
    ],
    Weaver: [
      RE('thread-snare', 'Thread Snare', 'skill', 'When a foe attacks an ally: weaken that foe.', { debuff: 'weak', range: 4 }, 'ally_attacked'),
      RE('quick-stitch', 'Quick Stitch', 'skill', 'When an ally is hurt: heal them 2 HP.', { heal: 2 }, 'ally_attacked'),
      RE('woven-aegis', 'Woven Aegis', 'defense', 'When an ally is attacked: give them 3 guard.', { shield: 3 }, 'ally_attacked'),
      RE('shared-breath', 'Shared Breath', 'skill', 'When an ally falls below half HP: heal them 3.', { heal: 3 }, 'ally_low_hp'),
      RE('thorn-thread', 'Thorn Thread', 'attack', 'When a foe attacks an ally: strike it for 2 damage.', { damage: 2, range: 4 }, 'ally_attacked'),
      C('mending-thread', 'Mending Thread', 'skill', 'Heal an ally 3 HP. Range 4.', { heal: 3, range: 4, target: 'ally' }),
      C('bright-knot', 'Bright Knot', 'skill', 'Give an ally +1 damage and 2 guard.', { buff: 'fury', shield: 2, range: 4, target: 'ally' }),
      C('thorn-tether', 'Thorn Tether', 'attack', 'Deal 1 damage and weaken a foe. Range 4.', { damage: 1, range: 4, debuff: 'weak' }),
      C('soft-landing', 'Soft Landing', 'defense', 'Give yourself or an ally 3 guard. Range 3.', { shield: 3, range: 3, target: 'ally' }),
      C('silkstep', 'Silkstep', 'movement', 'Dash 2 tiles.', { move: 2 })
    ],
    Barbarian: [
      RE('stand-between', 'Stand Between', 'defense', 'When an adjacent ally is attacked: take the hit and prevent 2 damage.', { shield: 2, redirect: true }, 'ally_adjacent_attacked'),
      RE('iron-reflex', 'Iron Reflex', 'defense', 'When attacked: prevent 4 damage.', { shield: 4 }, 'self_attacked'),
      RE('blood-roar', 'Blood Roar', 'skill', 'When an ally is attacked: taunt nearby foes until your next turn.', { taunt: 2 }, 'ally_attacked'),
      RE('reaver-counter', 'Reaver Counter', 'attack', 'When hit: strike the attacker for 3 damage.', { damage: 3, range: 1 }, 'self_attacked'),
      RE('last-stand', 'Last Stand', 'skill', 'When you fall below half HP: gain 4 guard.', { shield: 4 }, 'self_low_hp'),
      C('wide-cleave', 'Wide Cleave', 'attack', 'Deal 3 damage to a foe and 1 to adjacent foes.', { damage: 3, range: 1, splash: 1, splashDamage: 1 }),
      C('shoulder-rush', 'Shoulder Rush', 'attack', 'Charge up to 2 tiles, then deal 2 damage and push 1. Maximum reach 3.', { damage: 2, range: 1, move: 2, push: 1, charge: true }),
      C('war-cry', 'War Cry', 'skill', 'Taunt foes within 3 tiles and gain 2 guard.', { taunt: 3, shield: 2, range: 3 }),
      C('iron-hide', 'Iron Hide', 'defense', 'Gain 4 guard.', { shield: 4 }),
      C('warpath', 'Warpath', 'movement', 'Dash 2 tiles.', { move: 2 })
    ],
    Ranger: [
      RE('sidestep', 'Sidestep', 'movement', 'When targeted by a ranged attack: dash 2 tiles; evade it.', { move: 2, evade: true }, 'self_ranged_targeted'),
      RE('catch-arrow', 'Catch the Arrow', 'defense', 'When you are hit by a ranged attack: prevent it and return 2 damage.', { shield: 4, damage: 2, range: 5 }, 'self_ranged_hit'),
      RE('covering-shot', 'Covering Shot', 'attack', 'When a foe attacks an ally: shoot it for 2 damage.', { damage: 2, range: 5 }, 'ally_attacked'),
      RE('fox-trap', 'Fox Trap', 'skill', 'When a foe enters an adjacent tile: root it and deal 1 damage.', { damage: 1, range: 1, debuff: 'root' }, 'enemy_moves'),
      RE('parting-shot', 'Parting Shot', 'attack', 'When a foe leaves your range: deal 2 damage.', { damage: 2, range: 5 }, 'enemy_moves'),
      C('longshot', 'Longshot', 'attack', 'Deal 3 damage. Range 5.', { damage: 3, range: 5 }),
      C('pinning-arrow', 'Pinning Arrow', 'attack', 'Deal 2 damage and root a foe. Range 4.', { damage: 2, range: 4, debuff: 'root' }),
      C('vault', 'Vault', 'movement', 'Leap up to 3 tiles over walls and enemies.', { move: 3, jump: true }),
      C('fieldcraft', 'Fieldcraft', 'skill', 'Gain 2 guard and draw 1 card.', { shield: 2, draw: 1 }),
      C('marked-prey', 'Marked Prey', 'skill', 'Mark a foe; your next attack deals +2 damage. Range 5.', { debuff: 'marked', range: 5 })
    ],
    Swordsman: [
      RE('riposte', 'Riposte', 'attack', 'When an adjacent foe attacks you: parry and strike for 3.', { shield: 2, damage: 3, range: 1 }, 'self_adjacent_attacked'),
      RE('lunge-counter', 'Lunge Counter', 'attack', 'When a foe hits an ally beside you: strike it for 2.', { damage: 2, range: 2 }, 'ally_adjacent_attacked'),
      RE('measured-guard', 'Measured Guard', 'defense', 'When attacked: gain 3 guard.', { shield: 3 }, 'self_attacked'),
      RE('passing-cut', 'Passing Cut', 'attack', 'When a foe moves beside you: deal 2 damage.', { damage: 2, range: 1 }, 'enemy_moves'),
      RE('perfect-parry', 'Perfect Parry', 'defense', 'When an adjacent foe attacks: cancel it and draw 1.', { shield: 4, draw: 1, cancelMelee: true }, 'self_adjacent_attacked'),
      C('precise-cut', 'Precise Cut', 'attack', 'Deal 3 damage to one foe. Range 1.', { damage: 3, range: 1 }),
      C('sword-lesson', 'Read the Guard', 'skill', 'Mark a foe and draw 1 card. Range 3.', { debuff: 'marked', range: 3, draw: 1, target: 'enemy' }),
      C('advance', 'Advance', 'movement', 'Dash up to 2 tiles.', { move: 2 }),
      C('guarded-form', 'Guarded Form', 'defense', 'Gain 2 guard and +1 damage on your next attack.', { shield: 2, buff: 'fury' }),
      C('finishing-line', 'Finishing Line', 'attack', 'Deal 4 damage to a foe with half HP or less.', { damage: 4, range: 1, bonusVsWounded: true })
    ],
    Knight: [
      RE('shield-wall', 'Shield Wall', 'defense', 'When an ally beside you is attacked: give them 4 guard.', { shield: 4 }, 'ally_adjacent_attacked'),
      RE('bulwark-step', 'Bulwark Step', 'movement', 'When an ally is targeted: move 1 tile and guard them for 2.', { move: 1, shield: 2 }, 'ally_attacked'),
      RE('shield-retort', 'Shield Retort', 'attack', 'When hit by an adjacent foe: deal 2 and push it 1.', { damage: 2, range: 1, push: 1 }, 'self_adjacent_attacked'),
      RE('unyielding', 'Unyielding', 'defense', 'When you would be pushed or stunned: ignore it and gain 2 guard.', { shield: 2 }, 'self_attacked'),
      RE('vow-of-cover', 'Vow of Cover', 'skill', 'When an ally falls below half HP: taunt nearby foes.', { taunt: 2 }, 'ally_low_hp'),
      C('shield-bash', 'Shield Bash', 'attack', 'Deal 2 damage, push a foe 2 tiles and daze it. Range 1.', { damage: 2, range: 1, push: 2, debuff: 'daze' }),
      C('linebreaker', 'Linebreaker', 'attack', 'Deal 2 damage and push up to 2 foes 1 tile.', { damage: 2, range: 1, splash: 1, push: 1 }),
      C('brace', 'Brace', 'defense', 'Gain 4 guard; cannot be pushed this round.', { shield: 4, unpushable: true }),
      C('challenge', 'Challenge', 'skill', 'Taunt a foe within 4 tiles and weaken it.', { taunt: 4, debuff: 'weak', range: 4 }),
      C('shield-charge', 'Shield Charge', 'movement', 'Dash up to 2 tiles.', { move: 2 })
    ]
  };

  const SUBCLASSES = {
    Wizard: ['Archmage', 'Arcanist'], Weaver: ['Mender', 'Hexweaver'], Barbarian: ['Warlord', 'Reaver'],
    Ranger: ['Deadeye', 'Windstalker'], Swordsman: ['Duelist', 'Bounty Hunter'], Knight: ['Sentinel', 'Justiciar'],
    Rogue: ['Assassin', 'Thief']
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
      ['Tactical Retreat', 'When hit, gain 1 guard and move 1 tile.', 'evade', 1], ['True Aim', 'Attacks ignore 1 guard.', 'pierce', 1], ['Trailblazer', 'Jump cards can move +1 tile.', 'move', 1], ['Poisoned Tip', 'Your first debuff each round deals 1 damage.', 'debuffDamage', 1], ['Last Arrow', 'At 1 HP, your attacks deal +2 damage.', 'lowHpDamage', 2]
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

  const SUB_ABILITIES = {
    Archmage: [['Cataclysm', 'Your splash attacks deal +2 damage.', 'splashDamage', 2], ['Wide Arc', '+1 tile to every splash radius.', 'splash', 1], ['Spellstorm', 'A kill with a spell hits another nearby foe for 1.', 'killGuard', 1], ['Searing Edges', 'Attack cards add burn: 1 damage next enemy turn.', 'burn', 1], ['Deep Impact', 'Bosses take +1 spell damage.', 'bossDamage', 1], ['Overload', 'First attack card each round costs no action.', 'freeAttack', 1], ['Scorching Return', 'When hit, burn the attacker.', 'thorns', 1], ['Elemental Reach', '+1 range to attack cards.', 'range', 1], ['Cascade', 'Splash may chain one more target.', 'splash', 1], ['Apocalypse Ready', 'At full HP, first attack deals +2.', 'damage', 2]],
    Arcanist: [['Pocket Dimension', 'Hand size +1.', 'hand', 1], ['Second Thought', 'Draw 1 after playing a skill.', 'skillGuard', 1], ['Runic Safety', 'Your utility cards give 2 guard.', 'guard', 2], ['Unravel', 'Cleanse yourself on room entry.', 'cleanse', 1], ['Far Step', 'Teleport +2 tiles farther.', 'move', 2], ['Arcane Cache', 'Draw 1 extra card after each room.', 'roomDraw', 1], ['Counterspell', 'Cancel the first ranged enemy attack each room.', 'evade', 1], ['Lesser Wish', 'One ally skill can target all adjacent allies.', 'heal', 1], ['Mana Shell', 'Gain 1 guard when you draw outside turn start.', 'guard', 1], ['Quick Casting', 'The first skill each round does not count toward the card limit.', 'freeSkill', 1]],
    Mender: [['Greater Mend', 'Healing restores +2 more HP.', 'heal', 2], ['Circle of Care', 'Your heal reaches a second nearby ally for 2.', 'heal', 2], ['Renewal', 'Heal 1 HP at every turn start.', 'turnStartHeal', 1], ['Shared Vitality', 'Healing you receive also heals a nearby ally 1.', 'heal', 1], ['Last Hope', 'Revive a fallen ally once at 5 HP.', 'revive', 5], ['Soft Shield', 'Every heal gives 2 guard.', 'healGuard', 2], ['Calm Hands', 'Draw 1 whenever you heal a wounded ally.', 'healDraw', 1], ['Group Stitch', 'Room-clear healing restores 2 HP to everyone.', 'heal', 2], ['Clean Pulse', 'Cleanses also heal 2.', 'heal', 2], ['Unfading Thread', 'Buffs on allies last the whole room.', 'buffDuration', 1]],
    Hexweaver: [['Deep Hex', 'Debuffs you apply last +2 rounds.', 'debuff', 2], ['Pain Knot', 'Weak foes take +2 damage.', 'debuffDamage', 2], ['Withering Loop', 'First foe debuffed each turn loses 1 HP.', 'debuffDamage', 1], ['Snaring Pattern', 'Root affects foes beside the target.', 'splash', 1], ['Bad Omen', 'Debuffed enemies deal 2 less damage.', 'debuffDamage', 2], ['Tangle Mind', 'Debuffing a foe gives you 1 guard.', 'skillGuard', 1], ['Hex Shield', 'Your debuffs grant a nearby ally 1 guard.', 'allyGuard', 1], ['Brittle Fate', 'Your attacks deal +2 to weakened foes.', 'debuffDamage', 2], ['Black Thread', 'Rooted foes cannot target allies.', 'tauntGuard', 1], ['Fate Unspooled', 'Draw 1 after a debuffed foe falls.', 'killDraw', 1]],
    Warlord: [['Commanding Voice', 'Taunt reaches +2 tiles.', 'taunt', 2], ['Iron Formation', 'Adjacent allies gain 2 guard at turn end.', 'allyGuard', 2], ['War Banner', 'All allies deal +1 damage while beside you.', 'adjacentBuff', 1], ['No Retreat', 'You and adjacent allies cannot be pushed.', 'unpushable', 1], ['Punishing Guard', 'Foes that attack you take 2 damage.', 'thorns', 2], ['Rally', 'On a kill, all allies heal 1.', 'killHeal', 1], ['Bastion Roar', 'Taunted foes deal 2 less damage.', 'tauntGuard', 2], ['Stand Together', 'Gain 1 guard per adjacent ally.', 'guard', 1], ['War Tested', 'Reduce boss hits by 2.', 'reduction', 2], ['Lead the Charge', 'Adjacent allies move +1 tile.', 'move', 1]],
    Reaver: [['Blood Drinker', 'Heal 2 on every kill.', 'killHeal', 2], ['Wide Fury', 'Sweeps deal +2 damage.', 'splashDamage', 2], ['Relentless', 'Deal +2 damage below half HP.', 'lowHpDamage', 2], ['Life for Life', 'Heal for half your attack damage.', 'lifesteal', 1], ['Red Harvest', 'A kill grants 2 guard.', 'killGuard', 2], ['Crushing Weight', 'Push +1 tile and deal 1 extra.', 'push', 1], ['Pain into Power', 'When hit, your next attack gains +2 damage.', 'damage', 2], ['Cleave Through', 'Splash attacks chain to 2 foes.', 'splash', 2], ['Last One Standing', 'Deal +2 while no ally is adjacent.', 'damage', 2], ['Feast of Kings', 'Boss kill restores 5 HP.', 'bossHeal', 5]],
    Deadeye: [['Vital Mark', 'Marked foes take +3 ranged damage.', 'debuffDamage', 3], ['Perfect Sight', '+2 attack range.', 'range', 2], ['Piercing Shot', 'Ignore 2 guard.', 'pierce', 2], ['Weak Point', 'Critical hits on bosses deal +2.', 'bossDamage', 2], ['Double Tap', 'First ranged hit can strike again for 1.', 'damage', 1], ['Quarry', 'Keep a target marked between rooms.', 'debuff', 1], ['Quick Reload', 'Draw 1 after a ranged kill.', 'killDraw', 1], ['Still Aim', 'If you do not move, attacks deal +2.', 'damage', 2], ['Poisoned Broadhead', 'Ranged hits apply weak.', 'debuffDamage', 1], ['Last Word', 'Your first attack hits the boss at any range.', 'range', 2]],
    Windstalker: [['Windwalk', '+2 movement.', 'move', 2], ['Slipstream', 'Ignore walls while dashing.', 'move', 1], ['Smoke Veil', 'Ranged foes cannot target you after you move.', 'evade', 1], ['Rolling Snare', 'Roots splash to neighbors.', 'splash', 1], ['Ghost Step', 'You evade the first hit each turn.', 'evade', 1], ['Roving Aim', 'Deal +1 after moving this turn.', 'damage', 1], ['Tangle Trap', 'Rooted foes lose 2 damage.', 'debuffDamage', 2], ['Swift Hands', 'Draw a card after a 2+ tile move.', 'hitDraw', 1], ['Canny Escape', 'On hit, dash 1 tile.', 'evade', 1], ['Silent Quarry', 'Your debuffed targets cannot retaliate.', 'debuff', 1]],
    Duelist: [['Opening Gambit', 'First hit each round deals +2.', 'damage', 2], ['Unbroken Rhythm', 'Every second hit draws a card.', 'hitDraw', 1], ['Challenge Accepted', 'Focused foe deals 2 less damage.', 'reduction', 2], ['Find the Gap', 'Ignore 1 guard on your focused target.', 'pierce', 1], ['Swift Riposte', 'Parries deal +2 damage.', 'damage', 2], ['Close In', 'Move 1 after each attack.', 'move', 1], ['Finish Clean', 'Focused foes below half take +3 damage.', 'focus', 3], ['Blade Ward', 'Gain 2 guard after a kill.', 'killGuard', 2], ['Perfect Duel', 'Focused boss takes +2 damage.', 'bossDamage', 2], ['Measured Tempo', 'Hand size +1 while only one foe is nearby.', 'hand', 1]],
    'Bounty Hunter': [['Isolate', 'Foes with no adjacent allies take +2.', 'damage', 2], ['No Escape', 'Push targets toward you instead.', 'push', 1], ['Marked Contract', 'Marked foes take +2 from everyone.', 'debuffDamage', 2], ['Clean Finish', 'Gain 2 guard after a kill.', 'killGuard', 2], ['Cut Off', 'Adjacent foes cannot move past you.', 'tauntGuard', 1], ['Hunt Begins', 'Draw 1 when you mark a new foe.', 'hitDraw', 1], ['Executioner', 'Deal +3 to foes below quarter HP.', 'damage', 3], ['Pin Down', 'Your root lasts an extra turn.', 'debuff', 1], ['Cold Pursuit', 'Move 2 toward your focus at turn start.', 'move', 2], ['Dread Presence', 'Isolated foes deal 2 less damage.', 'debuffDamage', 2]],
    Sentinel: [['Aegis', 'Gain 2 guard whenever you defend.', 'shield', 2], ['Safe Haven', 'Adjacent allies reduce damage by 2.', 'allyGuard', 2], ['Wall of Steel', 'Cannot be pushed; reduce all damage by 1.', 'unpushable', 1], ['Counterwall', 'Pushers take 2 damage.', 'thorns', 2], ['Guardian Step', 'Move 1 to an ally targeted by an attack.', 'move', 1], ['Long Guard', 'Guard lasts through the next full round.', 'shield', 1], ['Shielded Company', 'Allies beside you gain +1 guard.', 'adjacentBuff', 1], ['Heavy Plate', 'Reduce boss attacks by 2.', 'reduction', 2], ['Holdfast', 'Enemies beside you deal 2 less damage.', 'tauntGuard', 2], ['Bastion', 'Once per room, ignore all damage from one source.', 'rescue', 1]],
    Justiciar: [['Judgment', 'Your push cards deal +2 damage.', 'pushDamage', 2], ['Sentence', 'Dazed foes lose their next action.', 'debuff', 1], ['Severe Rebuke', 'Your debuffed foes deal 2 less.', 'debuffDamage', 2], ['Righteous Charge', 'Push up to 3 tiles.', 'push', 2], ['Hammer of Law', 'Shield Bash stuns bosses for one round.', 'debuff', 1], ['Public Example', 'A pushed foe weakens nearby foes.', 'splash', 1], ['Punitive Guard', 'Attackers take 3 damage.', 'thorns', 3], ['Escort', 'Move an ally 2 and give 3 guard.', 'move', 1], ['Inexorable', 'Immune to root and shove.', 'unpushable', 1], ['Final Warning', 'Boss takes +2 while taunted by you.', 'bossDamage', 2]],
    Assassin: [['First Blood', 'Your first hit on a full-health foe deals +3.', 'damage', 3], ['Quiet Knife', 'Attacks from behind deal +2.', 'damage', 2], ['Poisoned Edge', 'Attacks apply weak.', 'debuffDamage', 1], ['Vanish', 'After a kill, evade the next attack.', 'evade', 1], ['Blood Price', 'Heal 2 on a kill.', 'killHeal', 2], ['Lethal Opening', 'Deal +2 to isolated foes.', 'damage', 2], ['Shadowstep', 'Move 2 after an attack.', 'move', 2], ['Marked for Death', 'Your mark lasts the room.', 'debuff', 1], ['No Witnesses', 'Deal +2 when no ally can see you.', 'damage', 2], ['Last Cut', 'Below half HP, attacks deal +3.', 'lowHpDamage', 3]],
    Thief: [['Light Fingers', 'Draw 1 when you claim loot.', 'hitDraw', 1], ['Smoke Bomb', 'Evade the first hit each round.', 'evade', 1], ['Slip Away', 'Movement cards gain +1 tile.', 'move', 1], ['Keen Eye', 'Reveal loot before the room clears.', 'roomDraw', 1], ['Second Pouch', 'Keep one extra consumable.', 'hand', 1], ['Sticky Hands', 'On a kill, claim a bonus coin.', 'killHeal', 1], ['Easy Mark', 'Foes you debuff deal 1 less.', 'debuffDamage', 1], ['Quick Escape', 'After stealing, move 2 tiles.', 'move', 2], ['Fence', 'Items restore +2 more HP or guard.', 'heal', 2], ['Cat Burglar', 'Artifact theft succeeds on 3+.', 'theft', 1]]
  };

  const ITEMS = [
    { id: 'tonic', name: 'Red Tonic', kind: 'consumable', text: 'Heal 4 HP.', effect: { heal: 4 } },
    { id: 'smoke-vial', name: 'Smoke Vial', kind: 'consumable', text: 'Gain 5 guard; your next move gains 2 extra tiles.', effect: { shield: 5, move: 2 } },
    { id: 'fire-oil', name: 'Fire Oil', kind: 'consumable', text: 'Your next attack deals +3 damage.', effect: { buff: 'nextAttack', buffPower: 3 } },
    { id: 'salt-pouch', name: 'Salt & Silver', kind: 'consumable', text: 'Deal 3 damage and cleanse a curse.', effect: { damage: 3, range: 3, cleanse: 1 } },
    { id: 'iron-charm', name: 'Iron Saint Charm', kind: 'permanent', text: 'Start each fight with 2 guard. Knights gain 1 more.', effect: { startGuard: 2 }, classBonus: { Knight: 1 } },
    { id: 'raven-ring', name: 'Raven Ring', kind: 'permanent', text: '+1 card each turn. Wizards draw one extra.', effect: { hand: 1 }, classBonus: { Wizard: 1 } },
    { id: 'wolf-cloak', name: 'Wolfskin Cloak', kind: 'permanent', text: '+1 movement; Rangers gain +1 more.', effect: { move: 1 }, classBonus: { Ranger: 1 } },
    { id: 'red-belt', name: 'Red Belt', kind: 'permanent', text: '+1 attack damage. Barbarians heal 1 on a kill.', effect: { damage: 1 }, classBonus: { Barbarian: 1 } },
    { id: 'needle', name: 'Weaver’s Needle', kind: 'permanent', text: 'Healing +1; Weavers draw a card on every heal.', effect: { heal: 1 }, classBonus: { Weaver: 1 } },
    { id: 'duel-glove', name: 'Duelist’s Glove', kind: 'permanent', text: 'Deal +1 to your focused foe. Swordsmen gain +1 more.', effect: { focusDamage: 1 }, classBonus: { Swordsman: 1 } },
    { id: 'tower-shield', name: 'Tower Shield', kind: 'permanent', text: '+2 guard from defense cards. Knights cannot be pushed.', effect: { shield: 2 }, classBonus: { Knight: 1 } },
    { id: 'fox-coin', name: 'Fox-Eye Coin', kind: 'permanent', text: 'Draw a card on a kill. Rogues succeed at theft on 3+.', effect: { killDraw: 1 }, classBonus: { Rogue: 1 } }
  ];

  const MODIFIERS = [
    { id: 'moon-slit', name: 'Moon-Slit Windows', buff: 'Players have +1 range.', debuff: 'Only 1 attack card per player per turn.', hero: { range: 1 }, rule: 'limit_attack' },
    { id: 'old-favor', name: 'An Old Favor', buff: 'The first ally heal each round restores +2.', debuff: 'Enemys first attack each round deals +1.', enemy: { damage: 1 }, rule: 'favor' },
    { id: 'echoing-hall', name: 'Echoing Hall', buff: 'Hand size +1.', debuff: 'Only one card of each type per turn.', hero: { hand: 1 }, rule: 'one_category' },
    { id: 'loose-stone', name: 'Loose Stonework', buff: 'Pushes deal +2 damage.', debuff: 'Movement cards lose 1 tile (minimum 1).', hero: { pushDamage: 2 }, rule: 'rough_move' },
    { id: 'lantern-tax', name: 'Lantern Tax', buff: 'Room-clear healing restores 2 HP.', debuff: 'The party begins this room with 1 less card.', rule: 'dim_start' },
    { id: 'red-rain', name: 'Red Rain', buff: 'Attacks deal +1 damage.', debuff: 'Healing is reduced by 1.', hero: { damage: 1 }, rule: 'blood-price' }
  ];

  const ENEMY_NAMES = {
    1: ['Guard', 'Soldier', 'Archer', 'Guard Dog'], 2: ['Soldier', 'Archer', 'Guard Dog', 'Horse'],
    3: ['Guard', 'Horse', 'Archer', 'Soldier'], 4: ['Guard Dog', 'Soldier', 'Horse', 'Archer'],
    5: ['Archer', 'Soldier', 'Horse', 'Guard Dog'], 6: ['King', 'Guard', 'Archer'],
    7: ['Monster', 'Skeleton', 'Zombie', 'Beast'], 8: ['Skeleton', 'Zombie', 'Beast', 'Monster'],
    9: ['Zombie', 'Monster', 'Skeleton', 'Beast'], 10: ['Beast', 'Skeleton', 'Zombie', 'Monster'],
    11: ['Monster', 'Beast', 'Zombie', 'Skeleton'], 12: ['Basilisk', 'Cockatrice', 'Gryphon', 'Zombie']
  };

  const getAbilityList = (className, subclass) => (subclass ? (SUB_ABILITIES[subclass] || []) : (ABILITIES[className] || []));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return { CLASS_ORDER, CLASSES, DECKS, SUBCLASSES, ABILITIES, SUB_ABILITIES, ITEMS, MODIFIERS, ENEMY_NAMES, getAbilityList, clone };
});

