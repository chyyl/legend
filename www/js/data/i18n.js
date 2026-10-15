/* ============================================================================
   js/data/i18n.js —— 中英双语文案（Q53）
   ----------------------------------------------------------------------------
   职责：集中管理所有 UI/系统文案的 i18n，避免散落硬编码。

   对外接口（window.LG.I18n）：
     .set(lang) .get(key, ...args) .lang .t 风格取值

   用法：LG.I18n.get('attack_mode') 或 LG.I18n.get('greet', name)。
   依赖：无（需在 ui.js 之前加载）。
   ========================================================================== */
(function () {
  'use strict';
  const LG = (window.LG = window.LG || {});

  const DICT = {
    zh: {
      title: 'LEGEND 传奇',
      start_solo: '单人冒险（1人房）',
      lobby: '联机大厅',
      create_room: '创建房间',
      join_room: '加入房间',
      room_code: '房间码',
      enter_code: '输入房间码',
      copy: '复制', copied: '已复制', paste: '粘贴', back: '返回',
      players_online: '在线玩家',
      difficulty: '难度系数',
      create_hero: '创建角色',
      name: '姓名', gender: '性别', male: '男', female: '女',
      appearance: '外观', initial_weapon: '初始武器',
      confirm: '确认', cancel: '取消', close: '关闭',
      bag: '背包', char: '属性', quest: '任务', map: '地图', settings: '设置', changelog: '更新日志',
      equip: '装备', enhance: '强化', drop: '丢弃', sell: '出售',
      cmp_eq: '对比·当前装备', cmp_best: '对比·行囊最佳', enh_bonus: '强化加成', enh_max: '强化·已满级',
      silver: '银币', level: '等级', exp: '经验',
      attack_mode: '攻击模式', mode_on: '开', mode_off: '关', mode_half: '半自动',
      hp: '生命', def: '防御', dodge: '闪避', move_speed: '移速',
      bonds: '羁绊', no_bond: '无羁绊',
      quest_accept: '接取', quest_submit: '提交', quest_progress: '进行中', quest_done: '已完成',
      q_kill: '击杀', q_collect: '收集', q_explore: '探索', q_boss: '讨伐', q_escort: '护送',
      npc_talk: '对话', npc_shop: '商店', npc_enhance: '强化重铸', npc_heal: '治疗',
      revive: '复活', down_rescue: '等待队友救援…',
      brightness: '画面亮度', volume: '音量', music: '音乐', sfx: '音效',
      fps_cap: '帧率上限', keybind: '按键自定义', language: '语言',
      minimap_view: '小地图查看', teleport_hint: '点击传送 · 滚轮或双指缩放',
      save: '存档', load: '读档', export: '导出', import: '导入',
      potion: '药水', block: '格挡', jump: '跳跃',
      interact: '交互', nothing_near: '附近没有可交互目标', come_closer: '走近一点才能交互',
      unreachable: '走不过去', silver_s: '银', pots: '药',
      boss_repeat: 'BOSS可重复挑战',
      loading: '正在载入…', dead: '你已倒下', back_camp: '返回营地',
      tutorial_skip: '跳过教程', tutorial_next: '下一步',
      // 阶段十三：主菜单拆分 + 目标引导（任务追踪条）
      start_game: '开始游戏', continue_game: '继续游戏', new_game: '新游戏',
      quest_available: '可接任务', quest_none: '暂无任务',
      guide_none: '找营地首领接取任务', guide_ready: '可提交，点击领取',
      guide_dist: '{0}格',
      // 阶段二十：背包详情卡/一键分解/字体大小；阶段二十三：改名一键出售 + 新增 UI大小/世界等级/随机名
      unequip: '卸下', dismantle: '一键出售', dismantle_confirm: '确认出售？',
      dismantle_done: '售出{0}件 +{1}银',
      atk: '攻击', aspd: '攻速', range: '射程', crit: '暴击', font_scale: '字体大小',
      ui_scale: 'UI大小', world_lv: '世界最高等级', auto: '自动', manual: '手动', random: '随机',
      decor_fx: '装饰景物', decor_on: '开', decor_off: '关',
    },
    en: {
      title: 'LEGEND',
      start_solo: 'Solo Adventure',
      lobby: 'Multiplayer Lobby',
      create_room: 'Create Room', join_room: 'Join Room',
      room_code: 'Room Code', enter_code: 'Enter code',
      copy: 'Copy', copied: 'Copied', paste: 'Paste', back: 'Back',
      players_online: 'Players Online',
      difficulty: 'Difficulty',
      create_hero: 'Create Hero',
      name: 'Name', gender: 'Gender', male: 'Male', female: 'Female',
      appearance: 'Look', initial_weapon: 'Starting Weapon',
      confirm: 'Confirm', cancel: 'Cancel', close: 'Close',
      bag: 'Bag', char: 'Stats', quest: 'Quests', map: 'Map', settings: 'Settings', changelog: 'Changelog',
      equip: 'Equip', enhance: 'Enhance', drop: 'Drop', sell: 'Sell',
      cmp_eq: 'vs Equipped', cmp_best: 'vs Best in Bag', enh_bonus: 'Enhance bonus', enh_max: 'Enhance · MAX',
      silver: 'Silver', level: 'Level', exp: 'EXP',
      attack_mode: 'Attack Mode', mode_on: 'On', mode_off: 'Off', mode_half: 'Half',
      hp: 'HP', def: 'DEF', dodge: 'Dodge', move_speed: 'Move',
      bonds: 'Bonds', no_bond: 'No Bond',
      quest_accept: 'Accept', quest_submit: 'Turn in', quest_progress: 'Active', quest_done: 'Done',
      q_kill: 'Kill', q_collect: 'Collect', q_explore: 'Explore', q_boss: 'Boss', q_escort: 'Escort',
      npc_talk: 'Talk', npc_shop: 'Shop', npc_enhance: 'Enhance', npc_heal: 'Heal',
      revive: 'Revive', down_rescue: 'Awaiting rescue…',
      brightness: 'Brightness', volume: 'Volume', music: 'Music', sfx: 'SFX',
      fps_cap: 'FPS Cap', keybind: 'Keybinds', language: 'Language',
      minimap_view: 'View Map', teleport_hint: 'Click to teleport · Scroll or pinch to zoom',
      save: 'Save', load: 'Load', export: 'Export', import: 'Import',
      potion: 'Potion', block: 'Block', jump: 'Jump',
      interact: 'Interact', nothing_near: 'Nothing to interact nearby', come_closer: 'Get closer to interact',
      unreachable: 'Cannot reach', silver_s: ' sil', pots: ' pot',
      boss_repeat: 'Bosses repeatable',
      loading: 'Loading…', dead: 'You are down', back_camp: 'Return to camp',
      tutorial_skip: 'Skip', tutorial_next: 'Next',
      // 阶段十三：主菜单拆分 + 目标引导（任务追踪条）
      start_game: 'Start Game', continue_game: 'Continue', new_game: 'New Game',
      quest_available: 'Available', quest_none: 'No quests',
      guide_none: 'See the camp chief for quests', guide_ready: 'Ready — tap to claim',
      guide_dist: '{0} tiles',
      // Stage 20: bag detail card / dismantle / font scale; Stage 23: Sell All + UI scale / world lv / reroll
      unequip: 'Unequip', dismantle: 'Sell All', dismantle_confirm: 'Confirm?',
      dismantle_done: 'Sold {0} items +{1} silver',
      atk: 'ATK', aspd: 'Atk Spd', range: 'Range', crit: 'Crit', font_scale: 'Font Size',
      ui_scale: 'UI Scale', world_lv: 'World Max Lv', auto: 'Auto', manual: 'Manual', random: 'Random',
      decor_fx: 'Decor', decor_on: 'On', decor_off: 'Off',
    },
  };

  let cur = 'zh';
  LG.I18n = {
    get lang() { return cur; },
    set(lang) { if (DICT[lang]) { cur = lang; LG.U.bus.emit('lang', lang); } },
    get(key, ...args) {
      let s = (DICT[cur] && DICT[cur][key]) || (DICT.zh[key]) || key;
      args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
      return s;
    },
  };
})();
