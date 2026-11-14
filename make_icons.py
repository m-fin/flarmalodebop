from PIL import Image, ImageDraw, ImageFilter
import math
S=1024
img=Image.new('RGB',(S,S))
px=img.load()
# diagonal gradient: warm coral (top-left) -> magenta -> deep plum (bottom-right)
stops=[(0,(255,179,102)),(0.45,(255,94,120)),(1,(84,34,120))]
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
for y in range(S):
    for x in range(S):
        t=(x*0.45+y*0.55)/S
        for i in range(len(stops)-1):
            if stops[i][0]<=t<=stops[i+1][0]:
                c=lerp(stops[i][1],stops[i+1][1],(t-stops[i][0])/(stops[i+1][0]-stops[i][0])); break
        else: c=stops[-1][1]
        px[x,y]=c
d=ImageDraw.Draw(img,'RGBA')
# soft staff lines
for i in range(5):
    y=300+i*95
    d.line([(0,y),(S,y+60)],fill=(255,240,220,38),width=10)
# glow
glow=Image.new('RGBA',(S,S),(0,0,0,0)); g=ImageDraw.Draw(glow)
g.ellipse([180,160,860,840],fill=(255,230,190,90)); glow=glow.filter(ImageFilter.GaussianBlur(120))
img.paste(glow,(0,0),glow)
d=ImageDraw.Draw(img,'RGBA')
cream=(255,246,232,255); shadow=(60,10,60,70)
def note(off,col):
    ox,oy=off
    # beam (slanted)
    d.polygon([(420+ox,250+oy),(760+ox,190+oy),(760+ox,280+oy),(420+ox,340+oy)],fill=col)
    # stems
    d.rectangle([420+ox,290+oy,470+ox,700+oy],fill=col)
    d.rectangle([710+ox,230+oy,760+ox,640+oy],fill=col)
    # heads (tilted ellipses)
    for cx,cy in [(370+ox,710+oy),(660+ox,650+oy)]:
        h=Image.new('RGBA',(260,190),(0,0,0,0)); ImageDraw.Draw(h).ellipse([5,5,255,185],fill=col)
        h=h.rotate(22,expand=True,resample=Image.BICUBIC)
        img.paste(h,(cx-h.width//2+20,cy-h.height//2),h)
note((14,22),shadow); d=ImageDraw.Draw(img,'RGBA'); note((0,0),cream)
# little heart
def heart(cx,cy,r,col):
    pts=[]
    for k in range(200):
        t=k/200*2*math.pi
        x=16*math.sin(t)**3; y=13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t)
        pts.append((cx+x*r,cy-y*r))
    d.polygon(pts,fill=col)
heart(800,760,7.5,(255,214,102,255))
img.save('public/icons/icon-1024.png')
for s in (512,192,180,167,152,32):
    img.resize((s,s),Image.LANCZOS).save(f'public/icons/icon-{s}.png')
# maskable: same art with padding
m=Image.new('RGB',(512,512),(255,94,120)); m.paste(img.resize((410,410),Image.LANCZOS),(51,51)); m.save('public/icons/maskable-512.png')
print('ok')
