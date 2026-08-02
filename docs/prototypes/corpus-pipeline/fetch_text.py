# ponytail: stdlib-only HTML->text for overlap-check captures
import sys, re, urllib.request
from html.parser import HTMLParser

class T(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "iframe"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.out = []
    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in ("p", "li", "br", "div", "h1", "h2", "h3", "h4", "tr"):
            self.out.append("\n")
    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)

url, dest = sys.argv[1], sys.argv[2]
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"})
html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
p = T()
p.feed(html)
text = re.sub(r"\n{3,}", "\n\n", "".join(p.out))
text = "\n".join(line.strip() for line in text.splitlines())
text = re.sub(r"\n{3,}", "\n\n", text).strip()
open(dest, "w").write(url + "\n\n" + text + "\n")
print(dest, len(text))
