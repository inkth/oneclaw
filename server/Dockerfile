# —— 构建阶段 ——————————————————————————————————————————
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV GOPROXY="https://goproxy.cn,https://proxy.golang.org,direct"
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd

# —— 运行阶段 ——————————————————————————————————————————
FROM alpine:3.20
# 换腾讯云内网 Alpine 镜像源:官方 dl-cdn 在国内 CVM 上极慢(ffmpeg+字体共 122 个包能拖 20+ 分钟,
# 部署常死在这层)。构建固定在腾讯云服务器上跑,tencentyun 内网镜像最快且免流量。
RUN sed -i 's|https\?://dl-cdn.alpinelinux.org|https://mirrors.tencentyun.com|g' /etc/apk/repositories
# ffmpeg = 出片后处理(烧字幕/CTA 尾帧);font-noto* = libass 多语言字形回退
# font-noto 基础包不含泰文字形,而 TH 是目标市场之一(region_lang.go),
# 缺 font-noto-thai 泰语字幕会渲染成方框,故必须显式带上。
RUN apk add --no-cache ca-certificates tzdata wget libwebp-tools \
        ffmpeg font-noto font-noto-cjk font-noto-thai font-noto-emoji && \
    addgroup -g 1000 app && \
    adduser -u 1000 -G app -D app
WORKDIR /home/app

COPY --from=builder /out/server ./server

USER app
EXPOSE 8080
# 用 GET(-O /dev/null)而非 --spider(HEAD)——go-api 只注册了 GET /health，HEAD 会 404。
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:8080/health || exit 1

CMD ["./server"]
