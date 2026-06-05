#!/usr/bin/env bash
# 部署 OneClaw (Next.js SSR) 到宿主机: PM2 + Nginx 反向代理 + Let's Encrypt SSL
# 用法: bash scripts/deploy.sh
#
# 前置条件:
#   1. DNS 已把 test.oneclaw.club 的 A 记录指向 $SERVER_IP
#   2. 服务器可用 server.pem 通过 SSH 登录
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_FILE="$ROOT/server.pem"
SERVER_USER=ubuntu
SERVER_IP=124.220.67.168
DOMAIN=test.oneclaw.club
EMAIL=admin@oneclaw.club
APP_NAME=oneclaw                   # PM2 进程名
APP_PORT=3100                      # Node.js 监听端口（避免和其他项目冲突）
DEPLOY_DIR=/home/$SERVER_USER/oneclaw  # 服务器上的部署目录

if [ ! -f "$KEY_FILE" ]; then
  echo "✗ SSH 密钥不存在: $KEY_FILE"
  exit 1
fi
chmod 600 "$KEY_FILE"

SSH_OPTS=(-i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=15)
TARGET="$SERVER_USER@$SERVER_IP"
run_remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo "═══════════════════════════════════════"
echo "  OneClaw 部署 (SSR + PM2 + Nginx)"
echo "  域名: $DOMAIN"
echo "  服务器: $TARGET"
echo "  端口: $APP_PORT"
echo "═══════════════════════════════════════"

# ── 1. 本地构建 (standalone 模式) ──────────────────────────────
echo ""
echo "==> [1/6] 本地构建..."
cd "$ROOT"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build

# standalone 产物检查
STANDALONE="$ROOT/.next/standalone"
[ -d "$STANDALONE" ] || { echo "✗ 未找到 .next/standalone，确认 next.config 已设 output:'standalone'"; exit 1; }
echo "✓ 构建完成"

# ── 2. 安装 Nginx + Certbot + Node.js + PM2 (幂等) ────────────
echo ""
echo "==> [2/6] 确保服务端依赖已安装..."
run_remote "
  export DEBIAN_FRONTEND=noninteractive
  # Nginx + Certbot
  if ! command -v nginx >/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq nginx certbot python3-certbot-nginx
    sudo systemctl enable nginx && sudo systemctl start nginx
  fi
  # Node.js (20.x LTS)
  if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  fi
  # PM2
  if ! command -v pm2 >/dev/null; then
    sudo npm install -g pm2
    pm2 startup systemd -u $USER --hp /home/$USER 2>/dev/null || true
  fi
"
echo "✓ 就绪"

# ── 3. 上传构建产物 + 静态资源 + env ──────────────────────────
echo ""
echo "==> [3/6] 上传到 $DEPLOY_DIR..."
run_remote "mkdir -p $DEPLOY_DIR"

# 上传 standalone (包含 server.js + node_modules 子集)
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" "$STANDALONE/" "$TARGET:$DEPLOY_DIR/"

# 上传静态资源 (.next/static → .next/static)
rsync -az -e "ssh ${SSH_OPTS[*]}" "$ROOT/.next/static/" "$TARGET:$DEPLOY_DIR/.next/static/"

# 上传 public 目录
if [ -d "$ROOT/public" ]; then
  rsync -az -e "ssh ${SSH_OPTS[*]}" "$ROOT/public/" "$TARGET:$DEPLOY_DIR/public/"
fi

# 环境变量：绝不用本地 dev 的 .env.local 覆盖服务器已有的生产配置
# 优先级：本地 .env.production（显式生产配置，覆盖） > 服务器已有 .env.local（保留） > 本地 .env.local（仅首次兜底）
if [ -f "$ROOT/.env.production" ]; then
  scp "${SSH_OPTS[@]}" "$ROOT/.env.production" "$TARGET:$DEPLOY_DIR/.env.local"
  echo "✓ 已用本地 .env.production 更新服务器环境变量"
elif run_remote "[ -f $DEPLOY_DIR/.env.local ]"; then
  echo "↩ 服务器已存在 .env.local，保留不覆盖（避免把本地 dev 配置推到生产）"
  echo "  如需更新生产环境变量：维护本地 .env.production，或直接编辑服务器上的 $DEPLOY_DIR/.env.local"
elif [ -f "$ROOT/.env.local" ]; then
  scp "${SSH_OPTS[@]}" "$ROOT/.env.local" "$TARGET:$DEPLOY_DIR/.env.local"
  echo "✓ 首次部署：已上传本地 .env.local 作为初始环境变量"
  echo "  ⚠ 请上服务器核对 AUTH_URL 等生产值（dev 值如 http://localhost:3000 需改成正式域名）"
else
  echo "⚠ 本地与服务器均无 .env.local，应用可能缺少环境变量"
fi

echo "✓ 上传完成"

# ── 4. PM2 启动/重启 Node.js 进程 ────────────────────────────
echo ""
echo "==> [4/6] PM2 启动 Node.js 服务..."
run_remote "
  cd $DEPLOY_DIR
  export PORT=$APP_PORT
  export HOSTNAME=0.0.0.0
  export NODE_ENV=production

  # 停止旧进程（如果存在）
  pm2 delete $APP_NAME 2>/dev/null || true

  # 启动新进程
  PORT=$APP_PORT HOSTNAME=0.0.0.0 pm2 start server.js \
    --name $APP_NAME \
    --env production \
    -- -p $APP_PORT

  pm2 save
  echo '--- PM2 进程状态 ---'
  pm2 list
"
echo "✓ PM2 启动完成 (端口 $APP_PORT)"

# ── 5. 配置 Nginx 反向代理 ───────────────────────────────────
echo ""
echo "==> [5/6] 配置 Nginx 反向代理..."
cat << NGINX_EOF | run_remote "sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null"
server {
    listen 80;
    server_name $DOMAIN;

    # Certbot 验证路径
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 静态资源长缓存
    location /_next/static/ {
        alias $DEPLOY_DIR/.next/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /public/ {
        alias $DEPLOY_DIR/public/;
        expires 7d;
    }

    # 所有其他请求反向代理到 Node.js
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_EOF

run_remote "
  sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
  sudo nginx -t
  sudo systemctl reload nginx
"
echo "✓ Nginx 配置完成 (http://$DOMAIN)"

# ── 6. 申请 SSL 证书 ────────────────────────────────────────
echo ""
echo "==> [6/6] 检查 DNS 并申请 Let's Encrypt 证书..."
RESOLVED=$(dig +short "$DOMAIN" 2>/dev/null | tail -n1)
if [ "$RESOLVED" = "$SERVER_IP" ]; then
  run_remote "
    sudo certbot --nginx \
      -d $DOMAIN \
      --non-interactive \
      --agree-tos \
      -m $EMAIL \
      --redirect
  "
  echo "✓ SSL 配置完成: https://$DOMAIN"
else
  echo "⚠ 跳过 SSL: 当前 $DOMAIN 解析为 [$RESOLVED]，不等于服务器 $SERVER_IP"
  echo "  请在 DNS 服务商处添加 A 记录: $DOMAIN → $SERVER_IP"
  echo "  待解析生效后重新执行: bash scripts/deploy.sh (会自动补签证书)"
fi

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 部署完成!"
echo "  访问: https://$DOMAIN"
echo "  PM2 管理:"
echo "    ssh -i server.pem $TARGET"
echo "    pm2 logs $APP_NAME     # 查看日志"
echo "    pm2 restart $APP_NAME  # 重启"
echo "    pm2 monit               # 监控"
echo "  重新发布: 重复执行本脚本即可"
echo "═══════════════════════════════════════"
