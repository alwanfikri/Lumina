# Lumina

Personal life management app — diary, agenda, photo gallery, and money tracker in one place.

**Live app:** https://alwanfikri.github.io/Lumina/

---

## Features

- **Diary** — Rich-text journal entries with mood tracking and photo references
- **Agenda** — Event management with Google Calendar sync and recurring event support
- **Photos** — Upload photos to Google Drive with gallery view
- **Money Tracker** — Income & expense logging with categories and charts
- **Themes** — Dark and light mode with auto-detect
- **Localization** — English and Indonesian (ID) locale support

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS, hosted on GitHub Pages |
| Backend | Google Apps Script (V8) |
| Database | Google Sheets |
| Storage | Google Drive (photos) |
| Calendar | Google Calendar API |

## Project Structure

```
/
├── index.html        # Frontend app
├── icon-192.png      # PWA icon
├── icon-512.png      # PWA icon
└── backend/
    └── Code.gs       # Google Apps Script backend
```

## Setup

### 1. Backend (Google Apps Script)

1. Buka [Google Apps Script](https://script.google.com) → New project
2. Copy isi `backend/Code.gs` ke editor
3. Edit `CONFIG` di baris atas — isi `SPREADSHEET_ID` dengan ID Google Sheets kamu
4. Deploy → **New deployment** → Type: **Web app**
   - Execute as: Me
   - Who has access: Anyone
5. Copy URL deployment-nya

### 2. Frontend

1. Fork repo ini
2. Di `index.html`, cari `DEFAULT_API` dan ganti dengan URL deployment Apps Script kamu
3. Enable GitHub Pages dari Settings → Pages → branch: main

### 3. Google Sheets

Buat Google Spreadsheet baru. Backend akan otomatis membuat sheet `Diary`, `Agenda`, `Photos`, dan `Money` saat pertama kali diakses.

---

## Links

- **Live app:** https://alwanfikri.github.io/Lumina/
- **Backend API:** https://script.google.com/macros/s/AKfycbzbYdcPjuZkMm6XwARZ-OCxCim-KyUNgVrjKIVWBfri2pIYEML7T6sOb2I0eYAia4HX/exec
