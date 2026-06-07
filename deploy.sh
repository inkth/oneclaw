#!/usr/bin/env bash
# oneclaw 部署脚本(Next + Go API + Postgres + nginx,整仓上同一台服务器)。
#
# 用法:
#   ./deploy.sh                完整:rsync 代码 + 重建 go-api & next + 健康检查
#   ./deploy.sh --quick        快速:跳过 rsync,只重建 go-api & next
#   ./deploy.sh --init         首次:远端建目录、首发 .env、首启全栈
#   ./deploy.sh --backup       备份:pg_dumpall 远端库到本地 ./backups/
#   ./deploy.sh --logs [N]     实时日志(默认 200 行,go-api)
#   ./deploy.sh --status       容器状态 + 健康检查
#   ./deploy.sh --shell        登录远端 shell
#   ./deploy.sh --help         帮助
#
# 连接配置:同目录建 .deploy.env(见 .deploy.env.example):
#   ONECLAW_SSH_HOST  公网 IP / 域名
#   ONECLAW_SSH_USER  登录用户(默认 ubuntu)
#   ONECLAW_SSH_KEY   .pem 路径(相对此脚本目录)
#   ONECLAW_REMOTE_DIR 远端目录(默认 /opt/oneclaw-server)

set -euo pipefail
cd "$(dirname "$0")"

if [ -f .deploy.env ]; then
  set -a; . ./.deploy.env; set +a
fi

ONECLAW_REMOTE_DIR="${ONECLAW_REMOTE_DIR:-/opt/oneclaw-server}"
COMPOSE="docker compose -f docker-compose.prod.yml"
BACKUP_DIR="./backups"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
  C_RESET=; C_DIM=; C_RED=; C_GREEN=; C_YELLOW=; C_BLUE=; C_CYAN=
fi
step()  { echo "${C_BLUE}▸${C_RESET} $*"; }
ok()    { echo "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}!${C_RESET} $*"; }
fail()  { echo "${C_RED}✗${C_RESET} $*" >&2; exit 1; }
info()  { echo "${C_DIM}  $*${C_RESET}"; }
head()  { echo; echo "${C_CYAN}━━ $* ━━${C_RESET}"; }

SSH_TARGET=""; SSH_BASE=(); RSYNC_E=""
if [ -n "${ONECLAW_SSH:-}" ]; then
  SSH_TARGET="$ONECLAW_SSH"
  SSH_BASE=(ssh -o BatchMode=yes -o ConnectTimeout=10)
  RSYNC_E="ssh -o BatchMode=yes -o ConnectTimeout=10"
elif [ -n "${ONECLAW_SSH_HOST:-}" ]; then
  user="${ONECLAW_SSH_USER:-ubuntu}"
  SSH_TARGET="${user}@${ONECLAW_SSH_HOST}"
  SSH_BASE=(ssh -o BatchMode=yes -o ConnectTimeout=10
            -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$HOME/.ssh/known_hosts")
  RSYNC_E="ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$HOME/.ssh/known_hosts"
  if [ -n "${ONECLAW_SSH_KEY:-}" ]; then
    [ -f "$ONECLAW_SSH_KEY" ] || fail "ONECLAW_SSH_KEY 指向的文件不存在:$ONECLAW_SSH_KEY"
    SSH_BASE+=(-i "$ONECLAW_SSH_KEY"); RSYNC_E="$RSYNC_E -i $ONECLAW_SSH_KEY"
  fi
else
  fail "未配置 SSH。请在 .deploy.env 设置 ONECLAW_SSH_HOST 或 ONECLAW_SSH。"
fi
remote() { "${SSH_BASE[@]}" "$SSH_TARGET" "$@"; }

RSYNC_EXCLUDES=(
  --exclude='.git' --exclude='.env' --exclude='.deploy.env'
  --exclude='node_modules' --exclude='.next' --exclude='server/bin'
  --exclude='backups/' --exclude='*.log' --exclude='.DS_Store'
  # 证书只在远端(certbot 生成),本地没有;--delete 会误删,必须排除
  --exclude='server/certs'
)

print_help() { sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; }

precheck_ssh() {
  step "SSH 预检 → ${SSH_TARGET}"
  remote 'echo ok' >/dev/null || fail "SSH 不通。检查 .deploy.env 与安全组放行 22。"
  ok "SSH 通"
}
precheck_local_env() {
  [ -f .env ] || fail "本地缺少 .env(不会盲发到生产)。先 cp server/.env.example .env 并填好密钥(含 DB_USER/DB_PASSWORD/DB_NAME/JWT_SECRET)。"
  ok "本地 .env 就绪"
}

cmd_logs() { remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE logs -f --tail=${1:-200} go-api next"; }

cmd_status() {
  precheck_ssh
  head "容器状态"; remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE ps"
  head "健康检查(容器内)"
  if remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE exec -T go-api wget -qO- http://localhost:8080/health" 2>/dev/null; then
    echo; ok "go-api 健康"
  else
    fail "/health 不可达"
  fi
}

cmd_shell() { "${SSH_BASE[@]}" -t "$SSH_TARGET" "cd $ONECLAW_REMOTE_DIR && exec \$SHELL"; }

cmd_init() {
  precheck_ssh; precheck_local_env
  head "首次初始化"
  step "确保远端目录存在 $ONECLAW_REMOTE_DIR"
  remote "sudo mkdir -p $ONECLAW_REMOTE_DIR && sudo chown -R \$(id -u):\$(id -g) $ONECLAW_REMOTE_DIR"
  step "首次 rsync(整仓,排除 node_modules/.next)"
  rsync -az --delete -e "$RSYNC_E" "${RSYNC_EXCLUDES[@]}" ./ "$SSH_TARGET:$ONECLAW_REMOTE_DIR/"
  if ! remote "[ -f $ONECLAW_REMOTE_DIR/.env ]"; then
    step "上传本地 .env(仅首次)"
    rsync -az -e "$RSYNC_E" ./.env "$SSH_TARGET:$ONECLAW_REMOTE_DIR/.env"
  fi
  step "首启全栈(postgres + go-api + next + nginx)"
  remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE up -d --build"
  ok "完成。./deploy.sh --status 验证;入口 http://${ONECLAW_SSH_HOST:-<host>}/(确认安全组放行 80)"
}

cmd_backup() {
  precheck_ssh; mkdir -p "$BACKUP_DIR"
  local f="$BACKUP_DIR/oneclaw-pg-$(date +%Y%m%d-%H%M%S).sql.gz"
  step "pg_dumpall → $f"
  remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE exec -T postgres pg_dumpall -U \${DB_USER:-postgres}" | gzip > "$f"
  ok "备份完成($(du -h "$f" | awk '{print $1}'))"
}

cmd_deploy() {
  local quick="${1:-false}"
  precheck_ssh; precheck_local_env
  head "$([ "$quick" = "true" ] && echo "快速重建" || echo "完整部署")"
  step "备份远端 .env"
  remote "[ -f $ONECLAW_REMOTE_DIR/.env ] && cp $ONECLAW_REMOTE_DIR/.env $ONECLAW_REMOTE_DIR/.env.bak.\$(date +%s) || true"
  if [ "$quick" != "true" ]; then
    step "rsync 代码 → $SSH_TARGET:$ONECLAW_REMOTE_DIR"
    rsync -az --delete -e "$RSYNC_E" "${RSYNC_EXCLUDES[@]}" ./ "$SSH_TARGET:$ONECLAW_REMOTE_DIR/"
  fi
  step "重建 go-api + next(postgres 不动)"
  remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE up -d --build go-api next nginx"
  step "等待 /health 就绪(最多 90s)"
  for i in $(seq 1 45); do
    if remote "cd $ONECLAW_REMOTE_DIR && $COMPOSE exec -T go-api wget -qO- http://localhost:8080/health" >/dev/null 2>&1; then
      ok "上线(约 $((i*2))s)"; info "入口:http://${ONECLAW_SSH_HOST:-<host>}/"; return 0
    fi
    sleep 2
  done
  fail "健康检查超时,用 ./deploy.sh --logs 查看"
}

case "${1:-deploy}" in
  --help|-h|help) print_help ;;
  --logs)         cmd_logs "${2:-200}" ;;
  --status)       cmd_status ;;
  --shell)        cmd_shell ;;
  --init)         cmd_init ;;
  --backup)       cmd_backup ;;
  --quick)        cmd_deploy true ;;
  deploy|"")      cmd_deploy false ;;
  *)              fail "未知参数 '$1'。--help 查看用法。" ;;
esac
