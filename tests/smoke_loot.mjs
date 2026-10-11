/**
 * Smoke Test: Loot & Smith Validation
 * Verifies: 4 tiers, boss exclusive pool, compare tooltip, smith +10 table
 * Run: node tests/smoke_loot.mjs
 */

import { createLootSystem } from '../js/gameplay/loot.js';
import { setGlobalSeed, globalPRNG } from '../js/prng.js';

const SEED = 0xDEADBEEF;

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

function runSmokeLoot() {
  console.log('\n🧪 SMOKE TEST: Loot & Smith System');
  console.log('='.repeat(50));

  // 1. Initialize loot system
  setGlobalSeed(SEED);
  const loot = createLootSystem({ rng: globalPRNG });

  // 2. Verify 4 quality tiers
  assert(loot.ITEM_QUALITY.COMMON === 0, 'Common = 0');
  assert(loot.ITEM_QUALITY.MAGIC === 1, 'Magic = 1');
  assert(loot.ITEM_QUALITY.RARE === 2, 'Rare = 2');
  assert(loot.ITEM_QUALITY.LEGENDARY === 3, 'Legendary = 3');

  const qualityNames = Object.values(loot.ITEM_QUALITY).filter(v => typeof v === 'number');
  assert(qualityNames.length === 4, 'Exactly 4 quality tiers');

  // 3. Verify affix counts per quality
  assert(loot.QUALITY_AFFIX_COUNTS[0] === 1, 'Common has 1 affix');
  assert(loot.QUALITY_AFFIX_COUNTS[1] === 2, 'Magic has 2 affixes');
  assert(loot.QUALITY_AFFIX_COUNTS[2] === 3, 'Rare has 3 affixes');
  assert(loot.QUALITY_AFFIX_COUNTS[3] === 3, 'Legendary has 3 affixes + unique');

  // 4. Verify main stats per slot
  for (const [slot, stat] of Object.entries(loot.MAIN_STATS)) {
    assert(stat !== undefined, `Slot ${slot} has main stat ${stat}`);
  }

  // 5. Generate items of each quality
  const qualities = ['COMMON', 'MAGIC', 'RARE', 'LEGENDARY'];
  for (const qName of qualities) {
    const quality = loot.ITEM_QUALITY[qName];
    const item = loot.generateItem('weapon', 10, quality);

    assert(item.quality === quality, `Generated ${qName} item has correct quality`);
    assert(item.mainStat.key === 'damage', `${qName} weapon has damage main stat`);
    assert(item.mainStat.value > 0, `${qName} weapon has positive damage`);
    assert(item.affixes.length === loot.QUALITY_AFFIX_COUNTS[quality],
      `${qName} has ${item.affixes.length} affixes (expected ${loot.QUALITY_AFFIX_COUNTS[quality]})`);
    assert(item.level === 10, `${qName} item has correct level`);
    assert(item.enhanced === 0, `${qName} item starts unenhanced`);
  }

  // 6. Boss exclusive pool exists
  assert(loot.AFFIX_POOLS.boss_exclusive.length === 5, 'Boss exclusive pool has 5 unique effects');
  const bossAffixIds = loot.AFFIX_POOLS.boss_exclusive.map(a => a.id);
  assert(bossAffixIds.includes('execute'), 'Has execute affix');
  assert(bossAffixIds.includes('thorns'), 'Has thorns affix');
  assert(bossAffixIds.includes('lifesteal'), 'Has lifesteal affix');
  assert(bossAffixIds.includes('cleave'), 'Has cleave affix');
  assert(bossAffixIds.includes('shield_on_kill'), 'Has shield_on_kill affix');

  // 7. Legendary boss drop gets unique effect
  let gotUnique = false;
  for (let i = 0; i < 20; i++) {
    const item = loot.generateItem('weapon', 20, loot.ITEM_QUALITY.LEGENDARY, true);
    if (item.uniqueEffect) {
      gotUnique = true;
      assert(item.uniqueEffect.isUnique === true, 'Unique effect marked as unique');
      assert(bossAffixIds.includes(item.uniqueEffect.id), 'Unique is from boss pool');
      break;
    }
  }
  assert(gotUnique, 'Boss drop legendary gets unique effect (tested 20 times)');

  // 8. Compare tooltip
  const commonWeapon = loot.generateItem('weapon', 5, loot.ITEM_QUALITY.COMMON);
  const rareWeapon = loot.generateItem('weapon', 5, loot.ITEM_QUALITY.RARE);
  const comparison = loot.compareItems(commonWeapon, rareWeapon);

  assert(comparison.better === true, 'Rare weapon is better than common');
  assert(comparison.deltas.mainStat > 0, 'Main stat delta positive');
  assert(comparison.summary === '升级', 'Summary shows upgrade');

  // Compare same quality
  const rareWeapon2 = loot.generateItem('weapon', 5, loot.ITEM_QUALITY.RARE);
  const comparison2 = loot.compareItems(rareWeapon, rareWeapon2);
  // Could be either, but should have deltas object
  assert(comparison2.deltas !== undefined, 'Comparison has deltas object');

  // 9. Smith enhancement table up to +10
  for (let level = 1; level <= 10; level++) {
    const info = loot.getSmithInfo(level);
    assert(info !== null, `Smith info exists for +${level}`);
    assert(info.cost > 0, `+${level} has cost ${info.cost}`);
    assert(info.statBonus > 0, `+${level} has stat bonus ${info.statBonus}`);
  }

  // Cost scaling check
  const costs = Array.from({length: 10}, (_, i) => loot.getSmithInfo(i + 1).cost);
  for (let i = 1; i < costs.length; i++) {
    assert(costs[i] > costs[i - 1], `Cost increases: +${i} (${costs[i-1]}) -> +${i+1} (${costs[i]})`);
  }

  // Fail chance starts at +7
  for (let level = 1; level <= 6; level++) {
    assert(loot.getSmithInfo(level).failChance === 0, `+${level} has 0% fail chance`);
  }
  assert(loot.getSmithInfo(7).failChance === 0.1, '+7 has 10% fail chance');
  assert(loot.getSmithInfo(8).failChance === 0.2, '+8 has 20% fail chance');
  assert(Math.abs(loot.getSmithInfo(9).failChance - 0.3) < 0.001, '+9 has 30% fail chance');
  assert(Math.abs(loot.getSmithInfo(10).failChance - 0.4) < 0.001, '+10 has 40% fail chance');

  // Destroy chance at +9, +10
  for (let level = 1; level <= 8; level++) {
    assert(loot.getSmithInfo(level).destroyChance === 0, `+${level} has 0% destroy chance`);
  }
  assert(loot.getSmithInfo(9).destroyChance === 0.05, '+9 has 5% destroy chance');
  assert(loot.getSmithInfo(10).destroyChance === 0.1, '+10 has 10% destroy chance');

  // 10. Enhancement actually works
  const testItem = loot.generateItem('weapon', 10, loot.ITEM_QUALITY.RARE);
  const originalDamage = testItem.mainStat.value;
  const originalAffixes = testItem.affixes.map(a => a.value);

  const enhanceResult = loot.enhanceItem(testItem);
  if (enhanceResult.success) {
    assert(testItem.enhanced === 1, 'Item enhanced to +1');
    assert(testItem.mainStat.value > originalDamage, 'Main stat increased after enhance');
    // Affixes should also increase
    for (let i = 0; i < testItem.affixes.length; i++) {
      assert(testItem.affixes[i].value >= originalAffixes[i], `Affix ${i} increased or maintained`);
    }
  }

  // 11. Can afford check
  const richPlayer = { gold: 100000 };
  const poorPlayer = { gold: 10 };
  assert(loot.canAffordEnhance(testItem, richPlayer.gold) === true, 'Rich player can afford');
  assert(loot.canAffordEnhance(testItem, poorPlayer.gold) === false, 'Poor player cannot afford');

  // 12. Loot drops from enemies
  const normalDrops = loot.generateLootDrop('basic', 5, false);
  assert(Array.isArray(normalDrops), 'Normal drops returns array');

  const bossDrops = loot.generateLootDrop('boss', 20, true);
  assert(bossDrops.length >= 2, 'Boss drops at least 2 items');
  const hasGold = bossDrops.some(d => d.type === 'gold');
  assert(hasGold, 'Boss drops include gold');

  // 13. Item naming
  const namedItem = loot.generateItem('chest', 15, loot.ITEM_QUALITY.RARE);
  assert(namedItem.name.length > 0, 'Item has generated name');
  assert(typeof namedItem.name === 'string', 'Name is string');

  // 14. Quality colors
  assert(loot.getQualityColor(0) === '#ffffff', 'Common color white');
  assert(loot.getQualityColor(1) === '#4488ff', 'Magic color blue');
  assert(loot.getQualityColor(2) === '#ffff44', 'Rare color yellow');
  assert(loot.getQualityColor(3) === '#ff8800', 'Legendary color orange');

  // 15. Quality names (Chinese)
  assert(loot.getQualityName(0) === '普通', 'Common name Chinese');
  assert(loot.getQualityName(1) === '魔法', 'Magic name Chinese');
  assert(loot.getQualityName(2) === '稀有', 'Rare name Chinese');
  assert(loot.getQualityName(3) === '传奇', 'Legendary name Chinese');

  console.log('='.repeat(50));
  console.log('✅ ALL LOOT & SMITH TESTS PASSED');
  console.log('='.repeat(50));
  return true;
}

try {
  runSmokeLoot();
  process.exit(0);
} catch (e) {
  console.error('\n❌ SMOKE TEST FAILED:', e.message);
  process.exit(1);
}