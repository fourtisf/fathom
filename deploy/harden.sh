#!/usr/bin/env bash
# Basic hardening for the Noxsea VPS (Ubuntu 24.04). Safe to re-run.
#   - ufw firewall: allow OpenSSH, 80, 443, then enable
#   - unattended-upgrades for security updates
#   - fail2ban with the default sshd jail
#   - pm2-logrotate (10M per file, keep 7)
#   - daily database backup at 03:17 via deploy/backup-db.sh
# It never edits SSH config. Usage (as root): bash deploy/harden.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO_DIR=$(pwd)

step() { printf '\n==> %s\n' "$*"; }
ok() { printf '    ok: %s\n' "$*"; }
warn() { printf '    !! %s\n' "$*"; }
fail() { printf '\n!! %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "Run as root: sudo bash deploy/harden.sh"
command -v apt-get >/dev/null || fail "This script expects Ubuntu/Debian (apt-get)."

apt_install() {
  local missing=()
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  if [ ${#missing[@]} -gt 0 ]; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
  fi
}

step "Firewall (ufw)"
apt_install ufw
echo "    SSH must stay allowed or you will lock yourself out. Allowing OpenSSH first."
# Always allow SSH before enabling, even if ufw is already active.
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
SSH_PORT=$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2; exit }' || true)
if [ -n "${SSH_PORT:-}" ] && [ "$SSH_PORT" != 22 ]; then
  echo "    sshd listens on port $SSH_PORT; allowing it too."
  ufw allow "$SSH_PORT/tcp" >/dev/null
fi
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
if ufw status | grep -q '^Status: active'; then
  ok "ufw already active; rules ensured"
else
  ufw --force enable >/dev/null
  ok "ufw enabled"
fi
ufw status | sed 's/^/    /'

step "Automatic security updates (unattended-upgrades)"
apt_install unattended-upgrades
AUTO=/etc/apt/apt.conf.d/20auto-upgrades
if grep -qs 'Unattended-Upgrade "1"' "$AUTO"; then
  ok "$AUTO already enables daily upgrades"
else
  [ -f "$AUTO" ] && cp "$AUTO" "$AUTO.bak.$(date +%s)"
  cat > "$AUTO" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  ok "wrote $AUTO"
fi
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
ok "unattended-upgrades enabled ($(systemctl is-active unattended-upgrades 2>/dev/null || echo unknown))"

step "fail2ban (default sshd jail)"
apt_install fail2ban
if [ ! -f /etc/fail2ban/jail.local ]; then
  cat > /etc/fail2ban/jail.local <<'EOF'
# Written by deploy/harden.sh. Uses fail2ban's default sshd settings.
[sshd]
enabled = true
EOF
  ok "wrote /etc/fail2ban/jail.local"
else
  ok "/etc/fail2ban/jail.local exists; left unchanged"
fi
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 1
fail2ban-client status sshd >/dev/null 2>&1 && ok "sshd jail active" || warn "sshd jail not reported yet; check: fail2ban-client status sshd"

step "PM2 log rotation (pm2-logrotate)"
# PM2 is per user. If the app runs under another account: PM2_USER=deploy bash deploy/harden.sh
pm2() {
  if [ -n "${PM2_USER:-}" ]; then sudo -iu "$PM2_USER" pm2 "$@"; else command pm2 "$@"; fi
}
if [ -n "${PM2_USER:-}" ] || command -v pm2 >/dev/null; then
  echo "    PM2 user: ${PM2_USER:-root}"
  if pm2 ls 2>/dev/null | grep -q pm2-logrotate; then
    ok "pm2-logrotate already installed"
  else
    pm2 install pm2-logrotate >/dev/null
    ok "pm2-logrotate installed"
  fi
  pm2 set pm2-logrotate:max_size 10M >/dev/null
  pm2 set pm2-logrotate:retain 7 >/dev/null
  ok "max_size 10M, retain 7"
else
  warn "pm2 not found; skipped. Install it (npm i -g pm2) and re-run this script."
fi

step "Daily database backup (03:17)"
apt_install postgresql-client
CRON_FILE=/etc/cron.d/noxsea-backup
cat > "$CRON_FILE" <<EOF
# Written by deploy/harden.sh: daily Noxsea database backup to /var/backups/noxsea (newest 14 kept).
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root bash $REPO_DIR/deploy/backup-db.sh >> /var/log/noxsea-backup.log 2>&1
EOF
chmod 644 "$CRON_FILE"
ok "installed $CRON_FILE (log: /var/log/noxsea-backup.log)"
echo "    Test it now with: bash $REPO_DIR/deploy/backup-db.sh"

step "Recommendation (not changed by this script)"
echo "    Use SSH keys only: once your key login works, set 'PasswordAuthentication no'"
echo "    and 'PermitRootLogin prohibit-password' in /etc/ssh/sshd_config.d/, then 'systemctl reload ssh'."
echo "    Keep a second SSH session open while you test, so a mistake can't lock you out."

printf '\nDone.\n'
