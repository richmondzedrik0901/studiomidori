# Studio Midori – Deployment Guide

## Step 1: Set up Firebase (10 minutes)

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**
2. Click **Add project** → name it `studio-midori` → Continue → skip Analytics → **Create project**
3. Click the **`</>`** (Web) icon → name it `studio-midori-web` → **Register app**
4. You will need these keys for Vercel Environment Variables. Do NOT paste them into the code directly.
5. Create a `.env` file locally (this file is ignored by Git for security) and add:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=studio-midori-xxxxx.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=studio-midori-xxxxx
   VITE_FIREBASE_STORAGE_BUCKET=studio-midori-xxxxx.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_DATABASE_URL=https://studio-midori-xxxxx-default-rtdb.firebaseio.com
   VITE_FIREBASE_MEASUREMENT_ID=...
   ```

6. In the Firebase sidebar: **Build → Realtime Database → Create database**
   - Choose a region (Asia Southeast is fine)
   - Start in **Test mode** → Enable

Done! Firebase is ready.

---

## Step 2: Push to GitHub

1. Create a new **private** repo on [github.com](https://github.com) — name it `studio-midori`
2. In your `studio-midori` folder, run:
   ```bash
   git init
   git add .
   git commit -m "Studio Midori MVP"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/studio-midori.git
   git push -u origin main
   ```

---

## Step 3: Deploy on Vercel (free & instant)

Deploying static sites on Vercel is super fast (takes ~15 seconds):

1. Go to **[vercel.com](https://vercel.com)** and sign in with **GitHub**.
2. Click **Add New...** (top right) → **Project**.
3. Under *Import Git Repository*, find **`studio-midori`** and click **Import**.
4. In the configuration screen:
   - **Project Name**: `studio-midori`
   - **Framework Preset**: *Vite*
   - **Root Directory**: `./` (default)
   - **Environment Variables**: Add all your `VITE_FIREBASE_...` keys here (and `VITE_WEBHOOK_URL` for notifications).
5. Click **Deploy**.

Vercel will build your Vite app securely and launch your site in seconds with a live link like:
`https://studio-midori.vercel.app` (or `https://studio-midori-xxxx.vercel.app`)

---

## Step 4: Share your links

Thanks to `vercel.json`'s clean URLs feature:

| Page | URL |
|------|-----|
| 🍵 Brand Homepage | `https://YOUR-APP.vercel.app/` |
| 🛒 Customer Order Wizard | `https://YOUR-APP.vercel.app/order` |
| 🗂️ Admin dashboard | `https://YOUR-APP.vercel.app/admin` (or `/admin.html` — keep private!) |

Post the homepage or order page link on your Facebook page or social media.

---

## Firebase Security Rules (lock down before going live)

Right now Firebase is in Test Mode — anyone with the URL can read/write.
Once you're happy with the setup, go to **Firebase → Realtime Database → Rules** and paste:

```json
{
  "rules": {
    "orders": {
      ".read": false,
      ".write": true
    }
  }
}
```

This allows customers to **write** (place orders) but not **read** all orders.
Your admin page uses the same Firebase config — for a true lock, you'd add Firebase Auth later.

---

## Updating the site later

Whenever you edit files, simply push to GitHub:
```bash
git add .
git commit -m "Update menu items"
git push
```
Vercel automatically detects the push and re-deploys within seconds!
