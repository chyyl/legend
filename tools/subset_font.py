# -*- coding: utf-8 -*-
"""tools/subset_font.py —— 楷体子集化工具（Q47 内置开源楷体）
从完整 LXGW WenKai TTF 中提取项目用字+常用字，生成 woff2 子集。
用法: python tools/subset_font.py   （需 pip install fonttools brotli）
"""
import os, sys, glob, subprocess
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, 'assets', 'font')
FULL = os.path.join(FONT_DIR, 'kai-full.ttf')
OUT = os.path.join(FONT_DIR, 'kai-subset.woff2')

# 1) 提取全部源码/文案字符
chars = set()
for pat in ['js/**/*.js', 'index.html', 'css/*.css', 'docs/*.md', 'README.md', 'TODO.md']:
    for f in glob.glob(os.path.join(ROOT, pat), recursive=True):
        try:
            with open(f, encoding='utf-8', errors='ignore') as fh:
                chars.update(fh.read())
        except Exception:
            pass

# 2) 追加常用汉字（动态文本如玩家名可用；罕见字回退系统楷体）
common = ('的一是不了人我在有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前面又定见只主没公从'
          '东西南北前后左右上下里外天地人花草树木山川河海岛屿城堡营地长城桥梁冰雪沙漠森林岩石泥土道路桥梁武器剑盾弓弩法杖头盔护甲护腿鞋品质普通稀有史诗传说羁绊锋利横扫经验力量暴击保护吸血不死金牌'
          '军团士兵弩手法士队长将军首领黑暗光明裂隙终末之战迷宫兵工厂农业园海湾小镇雪山骷髅岛勇士冒险者生命防御攻击闪避移动速度银币经验强化重铸商店任务接取提交完成奖励宝箱开启背包装备穿戴丢弃出售'
          '设置亮度音量音乐音效语言切换小地图查看传送存档读取导出导入房间创建加入连接玩家在线大厅单人联机世界种子难度系数滑块跳过教程确认取消关闭返回提示等待救援复活掉血格挡跳跃药水饮用')
chars.update(common)
chars.update('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
chars.update('.,:;!?()[]{}+-*/=<>"\'·、。，！？：；（）【】《》…—～￥%#&@√✓★☆▲△■□●○→←↑↓｜|')
chars = {c for c in chars if ord(c) >= 32}

txt = os.path.join(FONT_DIR, 'chars.txt')
with open(txt, 'w', encoding='utf-8') as f:
    f.write(''.join(sorted(chars)))
print('用字数:', len(chars))

# 3) 子集化（用 python -m fontTools.subset 模块调用，避免 Scripts 路径问题）
if not os.path.exists(FULL):
    print('缺少完整字体，请先下载 LXGWWenKai-Regular.ttf 到', FULL)
    sys.exit(1)

subprocess.run([sys.executable, '-m', 'fontTools.subset', FULL,
                '--text-file=' + txt,
                '--flavor=woff2',
                '--output-file=' + OUT,
                '--no-hinting'], check=True)

print('子集大小:', round(os.path.getsize(OUT) / 1024), 'KB ->', OUT)
# 4) 清理大文件（保留子集即可复现：本脚本可重复运行）
if os.environ.get('KEEP_FULL') != '1':
    os.remove(FULL)
    os.remove(txt)
    print('已清理完整字体与字符表（设置 KEEP_FULL=1 可保留）')
