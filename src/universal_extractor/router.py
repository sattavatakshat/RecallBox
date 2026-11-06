from urllib.parse import urlsplit

PLATFORM_ROOTS = {
    "youtube": ("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "instagram": ("instagram.com",),
    "reddit": ("reddit.com", "redd.it"),
    "twitter": ("twitter.com", "x.com"),
    "linkedin": ("linkedin.com",),
    "facebook": ("facebook.com", "fb.watch"),
    "github": ("github.com",),
    "bilibili": ("bilibili.com", "b23.tv"),
    "xiaohongshu": ("xiaohongshu.com", "xhslink.com"),
}


def platform_for(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower().rstrip(".")
    for name, roots in PLATFORM_ROOTS.items():
        if any(host == root or host.endswith("." + root) for root in roots):
            return name
    return "web"


def is_pdf(url: str) -> bool:
    return urlsplit(url).path.lower().endswith(".pdf")
