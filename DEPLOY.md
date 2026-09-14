# DispatchIQ — Live Deploy Guide (Namecheap + GitHub)

**Live URL:** https://dispatchiq.carzoro.com  

**Fresh admin (pehle DB wipe + seed ke baad):**
| Field | Value |
|--------|--------|
| Email | `admin@dispatchiq.com` |
| Password | `Click@321` |

---

## ⚠️ Pehle yeh samajh lo

### Frontend / backend alag deploy?

**Nahi.** Ek GitHub repo, ek subdomain (`dispatchiq.carzoro.com`).  
React build local pe hota hai → `backend/public/` me files aati hain → wahi live pe serve hoti hain.

| Jagah | Kya chalta hai |
|--------|----------------|
| **Local PC (PowerShell)** | Code edit, `npm run build`, `git push` |
| **GitHub website** | Repo banana (click), code store |
| **cPanel (browser)** | Subdomain, MySQL, SSL, Cron — mostly buttons, kam commands |
| **Namecheap Terminal / SSH** | `git clone`, `git pull`, `.env`, deploy script |

---

# COMMAND CHEATSHEET (konse kab kahan)

Har command ke saath likha hai: **Kab** · **Kahan** · **Kyun**

Replace karna:
- `YOUR_GITHUB_USER` → tumhara GitHub username  
- `YOUR_CPANEL_USERNAME` → tumhara cPanel username  
- Repo URL apni actual URL se

---

## A) PEHLI DAFA — Local PC (PowerShell)

**Kab:** Jab pehli dafa code GitHub pe bhejna ho.  
**Kahan:** Apna Windows PC, Cursor terminal / PowerShell.

```powershell
# 1) Project folder me jao
cd c:\Users\daniyal\Documents\Hunain\Projects\Custom\DispatchIQ

# 2) Frontend production build (UI files backend/public me)
.\scripts\build-frontend.ps1

#   Agar script fail ho / manually:
#   cd frontend
#   npm install
#   npm run build
#   cd ..

# 3) Git status dekho (.env list me NA hona chahiye)
git status

# 4) Sab stage karo
git add .

# 5) Phir se check — .env dikhe to mat add karo
git status

# 6) Commit
git commit -m "Initial DispatchIQ production build"

# 7) GitHub remote (repo pehle GitHub pe bana chuka hona chahiye)
git remote add origin https://github.com/YOUR_GITHUB_USER/DispatchIQ.git

# 8) Branch main
git branch -M main

# 9) GitHub pe bhejo
git push -u origin main
```

Agar `git init` pehle se nahi hua:

```powershell
cd c:\Users\daniyal\Documents\Hunain\Projects\Custom\DispatchIQ
git init
```

Phir upar wale steps 2–9.

---

## B) PEHLI DAFA — Namecheap Terminal / SSH

**Kab:** Jab GitHub pe code aa chuka ho, ab live server pe lana ho.  
**Kahan:** cPanel → Terminal, ya SSH client.

```bash
# 1) Home folder
cd ~

# 2) GitHub se code uthao (folder name: dispatchiq)
git clone https://github.com/YOUR_GITHUB_USER/DispatchIQ.git dispatchiq

# 3) Project me jao
cd ~/dispatchiq

# 4) Files check
ls

# 5) .env banao (GitHub pe nahi aati — sirf yahan)
cd ~/dispatchiq/backend
cp .env.example .env

# 6) .env edit (nano editor)
nano .env
#    DB_DATABASE, DB_USERNAME, DB_PASSWORD, APP_URL=https://dispatchiq.carzoro.com
#    APP_ENV=production, APP_DEBUG=false
#    Save: Ctrl+O → Enter → Ctrl+X

# 7) Laravel APP_KEY generate
php artisan key:generate

# 8) Fresh DB + admin seed + composer (SIRF PEHLI DAFA)
cd ~/dispatchiq
FRESH_DB=1 bash scripts/server-deploy.sh
```

Agar `bash` / script permission error:

```bash
cd ~/dispatchiq
chmod +x scripts/server-deploy.sh
FRESH_DB=1 bash scripts/server-deploy.sh
```

---

## C) BAAD ME HAR UPDATE — Local PC

**Kab:** Jab code change karke live pe bhejna ho.  
**Kahan:** Local PowerShell.

```powershell
cd c:\Users\daniyal\Documents\Hunain\Projects\Custom\DispatchIQ

# UI change hua ho to build zaroori
.\scripts\build-frontend.ps1

# Sirf backend PHP change ho to build skip kar sakte ho

git add .
git status
# .env list me na ho

git commit -m "Apna short message yahan"
git push
```

---

## D) BAAD ME HAR UPDATE — Namecheap Terminal

**Kab:** Local se `git push` ke baad, live pe naya code lana.  
**Kahan:** Namecheap Terminal / SSH.

```bash
cd ~/dispatchiq
git pull
bash scripts/server-deploy.sh
```

> Isme `FRESH_DB=1` **MAT** lagana — warna live data wipe ho jayega.

---

## E) Kabhi DB phir se bilkul clean chahiye (dangerous)

**Kab:** Sirf jab jaan-bujh kar saara live data mitaana ho.  
**Kahan:** Namecheap Terminal.

```bash
cd ~/dispatchiq
FRESH_DB=1 bash scripts/server-deploy.sh
```

Admin phir se: `admin@dispatchiq.com` / `Click@321`

---

## F) Useful check commands (jab problem ho)

### Local PC

```powershell
cd c:\Users\daniyal\Documents\Hunain\Projects\Custom\DispatchIQ
git status
git remote -v
git log -1 --oneline
```

### Namecheap Terminal

```bash
# Kaunsa folder / path
pwd
cd ~/dispatchiq && ls

# Document root me files hain?
ls ~/dispatchiq/backend/public

# .env maujood hai? (content mat paste karna chat me)
ls -la ~/dispatchiq/backend/.env

# Laravel log (errors)
tail -n 50 ~/dispatchiq/backend/storage/logs/laravel.log

# PHP / Composer version
php -v
composer -V
```

---

## G) cPanel pe JO COMMAND NAHI — buttons se

Yeh steps **Terminal commands nahi**, cPanel UI se:

| Kaam | Kahan click |
|------|-------------|
| Subdomain `dispatchiq.carzoro.com` | Domains / Subdomains |
| Document root → `.../dispatchiq/backend/public` | Same subdomain edit |
| MySQL DB + user | MySQL® Databases |
| SSL / HTTPS | SSL/TLS Status ya AutoSSL |
| Cron har minute | Cron Jobs (neeche formula) |

**Cron Job command** (cPanel form me paste):

```bash
* * * * * php /home/YOUR_CPANEL_USERNAME/dispatchiq/backend/artisan schedule:run >> /dev/null 2>&1
```

---

# DETAILED STEPS (upar cheatsheet ke saath follow karo)

## STEP 1 — Subdomain (cPanel, no git command)

1. cPanel login.
2. **Domains / Subdomains**.
3. Subdomain: `dispatchiq` → `dispatchiq.carzoro.com`.
4. Document root (clone ke baad set karo):

```
/home/YOUR_CPANEL_USERNAME/dispatchiq/backend/public
```

5. SSL on karo.

---

## STEP 2 — MySQL (cPanel, no git command)

1. **MySQL® Databases**.
2. Database + user banao, ALL PRIVILEGES.
3. Note karo: `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` (host usually `localhost`).

---

## STEP 3 — GitHub repo (browser)

1. github.com → **New repository**.
2. Private.
3. README mat add karo.
4. URL copy: `https://github.com/YOUR_GITHUB_USER/DispatchIQ.git`

Hosting GitHub se **auto magic** se nahi judti — tum SSH pe `git clone` / `git pull` se jodte ho.

---

## STEP 4 — Local: build + pehla push

→ **Cheatsheet section A** wale commands chalao (PowerShell).

Yaad:
- `npm run build` / `build-frontend.ps1` → **Local**
- `git push` → **Local** (GitHub ko bhejta hai)
- `.env` → **push mat karo**

---

## STEP 5 — Server: clone

→ **Cheatsheet section B**, commands 1–4.

Phir cPanel me document root sahi path pe set/update karo.

---

## STEP 6 — Server: `.env` only on hosting

→ **Cheatsheet section B**, commands 5–7.

Example values:

```env
APP_NAME=DispatchIQ
APP_ENV=production
APP_DEBUG=false
APP_URL=https://dispatchiq.carzoro.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=username_dispatchiq
DB_USERNAME=username_diq
DB_PASSWORD=YOUR_DB_PASSWORD

SESSION_DRIVER=database
SESSION_DOMAIN=.carzoro.com
QUEUE_CONNECTION=database
CACHE_STORE=database

SANCTUM_STATEFUL_DOMAINS=dispatchiq.carzoro.com
```

| File | GitHub? |
|------|---------|
| `backend/.env` | ❌ Kabhi nahi |
| `backend/.env.example` | ✅ OK (template) |
| Local PC `.env` | Alag; live se mix mat karo |

---

## STEP 7 — Fresh deploy (pehli dafa)

→ **Cheatsheet section B**, command 8:

```bash
FRESH_DB=1 bash scripts/server-deploy.sh
```

Login: https://dispatchiq.carzoro.com/login  
`admin@dispatchiq.com` / `Click@321`

---

## STEP 8 — Cron (cPanel)

→ **Cheatsheet section G** cron line.

---

## STEP 9 — Twilio (browser, app UI)

Live login → **Dynamic Settings** → SID / Token / Sender number.

---

## STEP 10 — Rozana / baad ke updates

1. Local → **Cheatsheet C** (`build` + `push`)  
2. Server → **Cheatsheet D** (`pull` + `deploy`)  

`FRESH_DB=1` mat lagana.

---

# Order yaad rakhne ke liye (timeline)

```
cPanel: subdomain + MySQL + SSL
        ↓
GitHub: private repo banao (browser)
        ↓
LOCAL PowerShell:
  build-frontend → git add → commit → push
        ↓
NAMECHEAP Terminal:
  git clone → cp .env.example .env → nano .env → key:generate
  → FRESH_DB=1 bash scripts/server-deploy.sh
        ↓
cPanel: document root + cron
        ↓
Browser: login + Twilio settings
        ↓
Later updates:
  LOCAL:  build → push
  SERVER: pull → bash scripts/server-deploy.sh
```

---

# Troubleshooting commands

| Problem | Kahan | Command / check |
|---------|--------|------------------|
| Push fail | Local | `git remote -v` — URL sahi? |
| Clone fail | Server | Private repo? token/login? |
| 500 error | Server | `tail -n 50 ~/dispatchiq/backend/storage/logs/laravel.log` |
| Blank / old UI | Local+Server | Local pe build + push hua? `ls ~/dispatchiq/backend/public/assets` |
| DB error | Server | `.env` me DB name/user/password |
| Queue/SMS stuck | cPanel | Cron line sahi path ke saath? |

---

# Security

- Repo **Private**.
- `.env` GitHub pe nahi.
- Live: `APP_DEBUG=false`.
- Admin password baad me app se change kar sakte ho.
