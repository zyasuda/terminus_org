# 灰の竜と塔の魔法使い:秘密の札12枚の組み合わせ81通りで、全員が達成できる結末があるかを数える
from itertools import product
DRAGON=['slain','calmed','bound']; EGG=['returned','taken','destroyed']
WIZ=['exposed','allied','confessed','killed']; HOARD=['shared','taken','used','left']
def valid(d,e,w,h):
    if (d=='calmed')!=(e=='returned'): return False   # 竜が鎮まるのは卵を返したときだけ
    if d=='slain' and h!='used': return False          # 竜を討つには財宝の中の竜殺しの槍が要る
    if d=='bound' and w not in('allied','confessed'): return False        # 竜を縛るのは魔法使いの鎖の術だけ
    return True
OUT=[o for o in product(DRAGON,EGG,WIZ,HOARD) if valid(*o)]
CARDS={
 'ガレス':{'G1 財宝を持ち帰る':lambda d,e,w,h:h in('taken','shared'),'G2 討伐の満額報酬':lambda d,e,w,h:d=='slain','G3 魔法使いと取引':lambda d,e,w,h:w in('allied','confessed')},
 'マレン':{'M1 卵を研究に持ち帰る':lambda d,e,w,h:e=='taken','M2 禁術を暴く':lambda d,e,w,h:w in('exposed','confessed'),'M3 竜と言葉を交わす':lambda d,e,w,h:d in('calmed','bound')},
 'ブロム':{'B1 誰も倒れずに帰る':lambda d,e,w,h:d!='slain','B2 竜を討って仇を取る':lambda d,e,w,h:d=='slain','B3 村に真相を伝える':lambda d,e,w,h:w in('exposed','confessed')},
 'イネス':{'I1 竜を村から遠ざける':lambda d,e,w,h:d in('slain','calmed'),'I2 魔法使いを追い出す':lambda d,e,w,h:w in('exposed','killed'),'I3 財宝を村の再建に':lambda d,e,w,h:h=='shared'},
}
names=list(CARDS); ok=0; rows=[]
for combo in product(*[list(CARDS[n].items()) for n in names]):
    sols=[o for o in OUT if all(f(*o) for _,f in combo)]
    best=max(sum(f(*o) for _,f in combo) for o in OUT)
    ok+=bool(sols); rows.append(([c for c,_ in combo],len(sols),best))
print('結末の数(矛盾しないもの):',len(OUT))
print('全員達成できる組み合わせ: %d/81 = %.0f%%'%(ok,ok/81*100))
from collections import Counter
print('最大達成人数の分布:',sorted(Counter(r[2] for r in rows).items()))
for n in names:
    for c in CARDS[n]:
        sub=[r for r in rows if c in r[0]]
        print(' ',c,'→ 全員達成できる回 %d/%d'%(sum(1 for r in sub if r[1]),len(sub)))
need=dict(confessed=0,shared=0,either=0)
for combo in product(*[list(CARDS[n].items()) for n in names]):
    sols=[o for o in OUT if all(f(*o) for _,f in combo)]
    if not sols: continue
    plain=[o for o in sols if o[2]!='confessed' and o[3]!='shared']
    if not plain:
        need['either']+=1
        if all(o[2]=='confessed' for o in sols): need['confessed']+=1
        if all(o[3]=='shared' for o in sols): need['shared']+=1
print('全員達成できる35通りのうち、自白か山分けでしか届かないもの:',need)
