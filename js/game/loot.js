/* ============================================================================
   js/game/loot.js —— 掉落/宝箱/品质抽取（Q34 高难度高掉落，Q44 宝箱概率表）
   ----------------------------------------------------------------------------
   职责：根据品质表生成武器/装备实例（含区间随机词条+羁绊），处理敌人掉落
         与宝箱开启，是所有"随机装备"的唯一工厂。

   对外接口（window.LG.Loot）：
     .rollWeapon(difficulty, regionLv, bonusP) -> weaponInstance
     .rollArmor(difficulty, regionLv, bonusP)  -> armorInstance
     .dropFromEnemy(kind, difficulty, enemyLv) -> {silver, exp, items[]}
     .openChest(difficulty, enemyLv)           -> {silver, exp, items[]}
       ↑ enemyLv = 敌人/宝箱等级（阶段二十三起调用方传 Config.worldLevel()，
        默认自动=玩家等级——清单111；旧口径为区域 lv）

   装备实例结构（供 inventory/ui 渲染）：
     { slot:'weapon'|'armor', weaponId?, armorSlot?, quality, lv:1,
       stats:{dmg,aspd,range,crit,def,spd,dodge}, bonds:[bondId...],
        prefix?:{zh,en}(武器专属，随机前缀词池), _id }

   依赖：core/config.js（品质表/羁绊表/公式）、core/utils.js。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});
  let uid = 0;

  /* 按品质表抽取一项（Q34：难度加成放大高品质概率） */
  function pickQuality(table, difficulty, bonusP) {
    return LG.Config.dropQuality(table, difficulty, bonusP);
  }

  /* 随机生成 n 个不重复羁绊（Q30 等概率，Q29 同类不叠加） */
  function rollBonds(n) {
    const pool = LG.Config.BONDS.map((b) => b.id);
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = (Math.random() * pool.length) | 0;
      out.push(pool.splice(idx, 1)[0]); // 取出即移除，保证不重复
    }
    return out;
  }

  /* ---------- 武器实例 ---------- */
  function rollWeapon(difficulty, regionLv, bonusP) {
    const q = pickQuality(LG.Config.QUALITY_W, difficulty, bonusP);
    const base = LG.U.pick(LG.Config.WEAPONS.filter((w) => w.kind !== 'shield'));
    // 阶段二十三清单（武器等级1-99）：掉落武器等级随世界最高等级（约70%-100%随机浮动）；
    // 上方 dmg 的 regionLv 成长系数同步吃到世界等级（调用方传 worldLevel）
    const lv = Math.max(1, 1 + Math.round((LG.Config.worldLevel() - 1) * (0.7 + Math.random() * 0.3)));
    // Q27：固定值伤害倍率 + 区间随机 攻速/范围/暴击
    const stats = {
      dmg: Math.round(base.base * q.mul * (1 + 0.1 * (regionLv - 1))),
      aspd: q.aspd ? LG.U.range(q.aspd) : 0,
      // 阶段十七：武器基础射程接入——基础值随物品入库，走既有 stats.range 管线
      // （品质词条在其上随机加成；calcStats 汇总后羁绊 rangeMul 乘算）
      range: base.range + (q.range ? LG.U.range(q.range) : 0),
      crit: q.crit ? LG.U.range(q.crit) : 0,
    };
    const nb = LG.U.randInt(q.bonds[0], q.bonds[1]);
    // 阶段二十：每件武器随机前缀（反馈"最好每一个武器都有前缀名字"），展示为「前缀·基础名」
    const prefix = LG.U.pick(LG.Config.WEAPON_PREFIXES);
    return { slot: 'weapon', weaponId: base.id, kind: base.kind, quality: q.id, lv,
             stats, bonds: rollBonds(nb), prefix, _id: ++uid };
  }

  /* ---------- 装备实例（四槽位之一） ----------
     阶段二十三（清单108"装备应该有加成（全方位的，重点不一样）"+反馈"装备数值有0"）：
     - 防御以百分点存储（5-50）：旧分数制(0.05-0.5)经取整后恒为 0，是"数值有0"的根源
     - 四词条全给：品质表缺位的词条给小兜底值，卡面不再出现 0 值行
     - 槽位侧重：头盔重防御、护甲防御+伤害、护腿重移速、鞋重闪避（重点不一样） */
  const SLOT_EMPH = { helm: { def: 1.25 }, chest: { def: 1.15, dmg: 1.3 },
                      legs: { spd: 1.3 }, boots: { dodge: 1.25, spd: 1.1 } };
  function rollArmor(difficulty, regionLv, bonusP) {
    const q = pickQuality(LG.Config.QUALITY_A, difficulty, bonusP);
    const slotDef = LG.U.pick(LG.Config.ARMOR_SLOTS);
    const em = SLOT_EMPH[slotDef.id] || {};
    const stats = {
      def: Math.max(1, Math.round(LG.U.range(q.def) * 100 * (em.def || 1))),
      spd: +(LG.U.range(q.spd ? [q.spd[0] * (em.spd || 1), q.spd[1] * (em.spd || 1)]
                              : [0.03 * (em.spd || 1), 0.08 * (em.spd || 1)])).toFixed(3),
      dmg: +LG.U.range(q.dmg ? [q.dmg[0] * (em.dmg || 1), q.dmg[1] * (em.dmg || 1)]
                              : [0.03, 0.06]).toFixed(3), // 伤害词条=总伤百分比（小数）
      dodge: +LG.U.range(q.dodge ? [q.dodge[0] * (em.dodge || 1), q.dodge[1] * (em.dodge || 1)]
                                  : [0.02, 0.05]).toFixed(3),
    };
    const nb = LG.U.randInt(q.bonds[0], q.bonds[1]);
    // 阶段二十三清单（装备等级1-99）：掉落装备等级随世界最高等级（与 rollWeapon 同规则）
    const lv = Math.max(1, 1 + Math.round((LG.Config.worldLevel() - 1) * (0.7 + Math.random() * 0.3)));
    return { slot: 'armor', armorSlot: slotDef.id, quality: q.id, lv,
             stats, bonds: rollBonds(nb), _id: ++uid };
  }

  /* ---------- 敌人死亡掉落（文档公式 + Q34 掉率加成） ---------- */
  function dropFromEnemy(kind, difficulty, regionLv) {
    // kind: 'normal'|'elite'|'boss'；regionLv=敌等级（阶段二十三=世界最高等级，见文件头）
    const se = LG.Config.silverExp(regionLv, kind, difficulty);
    const items = [];
    // 掉落概率：普通12% 精英45% BOSS必掉（并按难度加成）
    const baseP = kind === 'boss' ? 1 : kind === 'elite' ? 0.45 : 0.12;
    if (Math.random() < baseP * LG.Config.DIFFICULTY.drop(difficulty)) {
      items.push(Math.random() < 0.5 ? rollWeapon(difficulty, regionLv) : rollArmor(difficulty, regionLv));
    }
    // BOSS 额外保底一件高品质
    if (kind === 'boss') items.push(rollWeapon(difficulty, regionLv, 3));
    return { silver: se.silver, exp: se.exp, items };
  }

  /* ---------- 宝箱（Q44 可交互+概率表） ---------- */
  function openChest(difficulty, regionLv) {
    const se = LG.Config.silverExp(regionLv, 'normal', difficulty);
    const silver = Math.round(se.silver * (1 + Math.random()));
    const items = [];
    const n = LG.U.randInt(1, 2);
    for (let i = 0; i < n; i++) {
      // 宝箱品质略优于野怪（bonusP=1.5）
      items.push(Math.random() < 0.6 ? rollWeapon(difficulty, regionLv, 1.5) : rollArmor(difficulty, regionLv, 1.5));
    }
    return { silver, exp: Math.round(se.exp * 0.5), items };
  }

  LG.Loot = { rollWeapon, rollArmor, dropFromEnemy, openChest, rollBonds };
})();
