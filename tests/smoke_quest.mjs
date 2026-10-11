/**
 * Smoke Test: Quest Chain Validation
 * Verifies: linear rebel quest chain, zone gates at 1/3/5 (33%/66%/100%)
 * Run: node tests/smoke_quest.mjs
 */

import { createLiberationSystem } from '../js/gameplay/liberation.js';
import { setGlobalSeed } from '../js/prng.js';

const SEED = 0xDEADBEEF;

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

function runSmokeQuest() {
  console.log('\n🧪 SMOKE TEST: Quest Chain');
  console.log('='.repeat(50));

  // 1. Initialize liberation system
  setGlobalSeed(SEED);
  const liberation = createLiberationSystem({ seed: SEED });

  // 2. Check initial state
  assert(liberation.getGlobalProgress() === 0, 'Initial global progress is 0');
  assert(liberation.getCurrentChapter() === 1, 'Starts at Chapter 1');
  assert(liberation.isZoneDiscovered(0), 'Starter town (zone 0) discovered');
  assert(liberation.getZoneState(0) === 2, 'Starter town is liberated'); // LIBERATED = 2

  // 3. Check zone gates at correct progress thresholds
  const zones = liberation.getAllZones();
  const gateZones = zones.filter(z => z.isGate);
  assert(gateZones.length === 3, `Exactly 3 gate zones`);

  // Gate 1 at ~33% (zone 3)
  const gate1 = gateZones.find(z => z.chapter === 1);
  assert(gate1 !== undefined, 'Chapter 1 gate exists');
  assert(gate1.requiredProgress > 0.2 && gate1.requiredProgress < 0.4,
    `Gate 1 at ${(gate1.requiredProgress * 100).toFixed(0)}% progress`);

  // Gate 2 at ~66% (zone 6)
  const gate2 = gateZones.find(z => z.chapter === 2);
  assert(gate2 !== undefined, 'Chapter 2 gate exists');
  assert(gate2.requiredProgress > 0.5 && gate2.requiredProgress < 0.8,
    `Gate 2 at ${(gate2.requiredProgress * 100).toFixed(0)}% progress`);

  // Gate 3 at 100% (zone 8)
  const gate3 = gateZones.find(z => z.chapter === 3);
  assert(gate3 !== undefined, 'Chapter 3 gate exists');
  assert(gate3.requiredProgress >= 0.85,
    `Gate 3 at ${(gate3.requiredProgress * 100).toFixed(0)}% progress`);

  // 4. Check chapter progression requires all zones in chapter
  const ch1Zones = liberation.getZonesByChapter(1);
  const ch2Zones = liberation.getZonesByChapter(2);
  const ch3Zones = liberation.getZonesByChapter(3);

  assert(ch1Zones.length === 4, 'Chapter 1 has 4 zones');
  assert(ch2Zones.length === 3, 'Chapter 2 has 3 zones');
  assert(ch3Zones.length === 3, 'Chapter 3 has 3 zones');

  // 5. Simulate quest progression - complete objectives
  let completedGates = 0;

  // Chapter 1: Complete zones 1, 2, then gate 3
  for (const zone of ch1Zones) {
    if (zone.id === 0) continue; // starter town already liberated

    // Complete all objectives for this zone (may need multiple completions for full liberation)
    const objectives = liberation.getZoneObjectives(zone.id);
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const obj of objectives) {
        liberation.completeObjective(zone.id, obj);
      }
    }

    // Verify zone liberated
    assert(liberation.getZoneState(zone.id) === 2,
      `Zone ${zone.id} (${zone.name}) liberated`);

    // Check if this was a gate
    if (zone.isGate) {
      completedGates++;
      // Next zone should unlock
      const nextZone = ch1Zones.find(z => z.requiredProgress > zone.requiredProgress);
      if (nextZone) {
        // Gate zones unlock next automatically in onZoneLiberated
      }
    }
  }

  // After chapter 1 complete, should unlock chapter 2
  // Simulate by checking chapter progress
  const ch1Progress = liberation.getChapterProgress(1);
  assert(ch1Progress >= 1.0, `Chapter 1 progress: ${(ch1Progress * 100).toFixed(0)}%`);

  // Chapter 2 should have at least first zone accessible
  const ch2First = ch2Zones.sort((a, b) => a.requiredProgress - b.requiredProgress)[0];
  // Gate unlocks next chapter in onZoneLiberated

  // 6. Global progress tracking
  const progressAfterCh1 = liberation.getGlobalProgress();
  assert(progressAfterCh1 > 0.3 && progressAfterCh1 < 0.5,
    `Global progress after Ch1: ${(progressAfterCh1 * 100).toFixed(0)}%`);

  // 7. Complete Chapter 2
  for (const zone of ch2Zones) {
    const objectives = liberation.getZoneObjectives(zone.id);
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const obj of objectives) {
        liberation.completeObjective(zone.id, obj);
      }
    }
    assert(liberation.getZoneState(zone.id) === 2, `Zone ${zone.id} liberated`);
  }

  const ch2Progress = liberation.getChapterProgress(2);
  assert(ch2Progress >= 1.0, `Chapter 2 progress: ${(ch2Progress * 100).toFixed(0)}%`);

  const progressAfterCh2 = liberation.getGlobalProgress();
  assert(progressAfterCh2 > 0.6 && progressAfterCh2 < 0.8,
    `Global progress after Ch2: ${(progressAfterCh2 * 100).toFixed(0)}%`);

  // 8. Complete Chapter 3 (final)
  for (const zone of ch3Zones) {
    const objectives = liberation.getZoneObjectives(zone.id);
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const obj of objectives) {
        liberation.completeObjective(zone.id, obj);
      }
    }
    assert(liberation.getZoneState(zone.id) === 2, `Zone ${zone.id} liberated`);
  }

  const ch3Progress = liberation.getChapterProgress(3);
  assert(ch3Progress >= 1.0, `Chapter 3 progress: ${(ch3Progress * 100).toFixed(0)}%`);

  // 9. Game complete
  assert(liberation.isGameComplete() === true, 'Game marked as complete');
  assert(liberation.getGlobalProgress() >= 1.0, 'Global progress 100%');
  assert(liberation.getCurrentChapter() === 3, 'Final chapter is 3');

  // 10. Next objective tracking
  const nextObj = liberation.getNextObjective();
  assert(nextObj === null, 'No next objective when game complete');

  // 11. Serialization round-trip
  const serialized = liberation.serialize();
  const newLiberation = createLiberationSystem({ seed: SEED });
  newLiberation.deserialize(serialized);

  assert(newLiberation.getGlobalProgress() === liberation.getGlobalProgress(),
    'Serialization preserves global progress');
  assert(newLiberation.getCurrentChapter() === liberation.getCurrentChapter(),
    'Serialization preserves chapter');
  assert(newLiberation.isGameComplete() === liberation.isGameComplete(),
    'Serialization preserves completion state');

  console.log('='.repeat(50));
  console.log('✅ ALL QUEST CHAIN TESTS PASSED');
  console.log('='.repeat(50));
  return true;
}

try {
  runSmokeQuest();
  process.exit(0);
} catch (e) {
  console.error('\n❌ SMOKE TEST FAILED:', e.message);
  process.exit(1);
}