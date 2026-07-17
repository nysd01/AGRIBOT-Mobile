# Nginx Reverse Proxy + TLS (rubric §1)

Nginx is the **public entry point** for AGRIBOT. It terminates TLS and forwards
to the API (kept private on `localhost:18080`). This also lets the **ESP32 sensor node**
post over HTTPS, which its firmware requires.

> This VPS already hosts other Nginx sites on 443, so AGRIBOT listens on its own TLS
> port **8443** to avoid clashing with them.

## 1. Install Nginx
```bash
sudo apt update && sudo apt install -y nginx
```

## 2. Generate a self-signed TLS certificate
(Use Let's Encrypt instead if you have a domain — but self-signed is fine because the
ESP32 firmware calls `client.setInsecure()`.)
```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/agribot.key \
  -out    /etc/nginx/ssl/agribot.crt \
  -subj "/CN=38.242.246.126"
```

## 3. Install the site config
```bash
sudo cp ~/AGRIBOT-Mobile/agribot-api/nginx/agribot.conf /etc/nginx/sites-available/agribot.conf
sudo ln -sf /etc/nginx/sites-available/agribot.conf /etc/nginx/sites-enabled/agribot.conf
sudo rm -f /etc/nginx/sites-enabled/default      # remove the default welcome page
sudo nginx -t                                    # test config
sudo systemctl reload nginx
```

## 4. Open the firewall
```bash
sudo ufw allow 8443
```

## 5. Verify
```bash
curl -k https://38.242.246.126:8443/health      # -k accepts the self-signed cert
# -> {"status":"ok","service":"agribot-api",...}
```
Open `https://38.242.246.126:8443/docs` in a browser (accept the certificate warning) —
the Swagger UI now loads over HTTPS through the proxy.

## Why this matters (report)
- **Single entry point** — only Nginx is exposed; the API, Postgres, Prometheus and
  Grafana stay off the public internet. Smaller attack surface (ASR-7 / §1).
- **TLS termination** — encryption handled in one place, not in every service.
- **Future-proof** — add rate-limiting, caching, or more backends here without touching
  the app. This is the classic reverse-proxy architecture tactic.
