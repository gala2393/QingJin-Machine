import sys
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS=None
def grid(pg,box,out,w=700):
    im=Image.open(f'scripts/work156/halves/pg{pg:03d}.jpg'); W,H=im.size
    c=im.crop((int(box[0]*W),int(box[1]*H),int(box[2]*W),int(box[3]*H)))
    c=c.resize((w,round(c.height*w/c.width)))
    d=ImageDraw.Draw(c)
    for i in range(0,101,5):
        px=(i/100-box[0])/(box[2]-box[0])*w
        if 0<=px<=w:
            d.line([(px,0),(px,c.height)],fill=(255,0,0) if i%10==0 else (255,170,170),width=1)
            if i%10==0: d.text((px+2,2),str(i),fill=(255,0,0))
    for j in range(0,101,5):
        py=(j/100-box[1])/(box[3]-box[1])*c.height
        if 0<=py<=c.height:
            d.line([(0,py),(w,py)],fill=(0,150,0) if j%10==0 else (150,220,150),width=1)
            d.text((2,py+1),str(j),fill=(0,150,0))
    d.text((w-60,2),f'p{pg}',fill=(0,0,255))
    return c
if __name__=='__main__':
    # usage: gridtool.py out.jpg page:x0,y0,x1,y1 ...
    out=sys.argv[1]; items=[]
    for a in sys.argv[2:]:
        p,b=a.split(':'); items.append(grid(int(p),[float(v) for v in b.split(',')],None))
    H=sum(i.height for i in items)
    s=Image.new('RGB',(700,H),'white'); y=0
    for i in items: s.paste(i,(0,y)); y+=i.height
    s.save(out,quality=85)
