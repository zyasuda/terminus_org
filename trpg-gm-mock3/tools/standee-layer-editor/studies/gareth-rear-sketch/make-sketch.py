from PIL import Image, ImageDraw
from pathlib import Path
out=Path(__file__).parent
im=Image.new('RGB',(1024,1024),'#808080'); d=ImageDraw.Draw(im)
ink='#252b30'; skin='#d7b49a'; steel='#b8c3ca'; leather='#675044'
# 背面から見た右手。掌をこちらへ向け、親指を画面左、4指を下へ。
d.polygon([(530,90),(660,90),(665,225),(720,280),(745,375),(710,440),(570,455),(490,375),(500,280),(525,230)],fill=skin,outline=ink,width=5)
# 柄と刀身は右上から左下へ。同じ直線上に置く。
d.line([(758,188),(500,493)],fill=ink,width=43)
d.line([(758,188),(500,493)],fill=leather,width=32)
d.ellipse((735,164,790,219),fill='#ac9168',outline=ink,width=5)
d.polygon([(505,480),(535,507),(218,920),(185,957),(202,911)],fill=steel,outline=ink,width=5)
d.line([(194,938),(518,494)],fill='#788b98',width=3)
d.line([(453,447),(584,555)],fill=ink,width=24)
d.line([(453,447),(584,555)],fill='#ac9168',width=15)
# 指は柄を包んで手前に重なる。爪の見える4指の巻き込みを模式表示。
for x,y in [(548,355),(591,371),(634,381),(677,380)]:
 d.rounded_rectangle((x,y,x+46,y+86),radius=19,fill=skin,outline=ink,width=4)
 d.rounded_rectangle((x+8,y+45,x+36,y+70),radius=8,fill='#e6c6b3',outline=ink,width=2)
# 親指：画像左から柄の中央へ巻き付く。
d.polygon([(506,280),(473,319),(481,370),(528,394),(577,366),(566,340),(525,343),(531,309)],fill=skin,outline=ink,width=5)
d.arc((520,260,657,373),20,145,fill=ink,width=3)
im.save(out/'right-palm-sword-sketch.png')
print('Sketch PNG: 1024x1024; right palm thumb=image-left; schematic, not anatomy proof')
