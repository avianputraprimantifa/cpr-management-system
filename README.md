# Carlton Management System

Aplikasi manajemen komunitas residensial — React + Vite + TypeScript + Tailwind + shadcn-style UI, dengan Supabase (Auth, Database, Storage, Edge Functions).

UI sepenuhnya dalam **Bahasa Indonesia**.

## Status

- ✅ Schema, RLS policies, GRANTs, storage buckets, dan realtime sudah dikonfigurasi di Supabase
- ✅ Edge Functions `admin-create-user` dan `admin-delete-user` ter-deploy
- ✅ Frontend kompilasi bersih (`npm run build`), dev server aktif di `http://localhost:5173/`

## Menjalankan

Node terpisah ter-install di `~/.local/cms-node/`. Tambahkan ke PATH atau jalankan via path lengkap:

```bash
export PATH="$HOME/.local/cms-node/bin:$PATH"
cd ~/Projects/carlton-management-system
npm run dev      # dev server
npm run build    # production build (output: dist/)
npm run preview  # preview hasil build
```

Untuk install permanen: `brew install node` lalu hapus folder `~/.local/cms-node/`.

## Peran & Akses

| Peran    | Dashboard | Tagihan IPL    | Penghuni      | Lingkungan | Jadwal Satpam | Notifikasi |
|----------|-----------|----------------|---------------|------------|---------------|------------|
| admin    | ✓         | CRUD penuh     | CRUD + buat akun | CRUD       | CRUD          | ✓          |
| pengurus | ✓         | CRUD penuh     | edit          | CRUD       | CRUD          | ✓          |
| penghuni | ✓         | tagihan sendiri | —             | baca       | —             | ✓          |
| satpam   | ✓         | —              | —             | CRUD       | baca + tugas sendiri | ✓ |

## Struktur

```
src/
├── components/
│   ├── ui/                  # shadcn-style primitives (button, card, dialog, sidebar, ...)
│   ├── ipl/                 # BillFormDialog, BillPayDialog, BillReceiptDialog, BillCsvImportDialog
│   ├── residents/           # ResidentFormDialog
│   ├── environment/         # EnvItemDialog
│   ├── shifts/              # AssignShiftDialog
│   ├── AppLayout.tsx
│   ├── AppSidebar.tsx
│   ├── ProtectedRoute.tsx
│   └── UserMenu.tsx
├── hooks/use-mobile.tsx
├── integrations/supabase/{client.ts,types.ts}
├── lib/{auth.tsx, date.ts, currency.ts, utils.ts, i18n/messages.ts}
├── pages/{Login,Dashboard,Ipl,Residents,Environment,Shifts,Notifications}.tsx
├── App.tsx
├── main.tsx
└── index.css                # design tokens (HSL CSS vars)
```

## Variabel Lingkungan

`.env.local` (gitignored):

```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
```

Jangan commit `.env.local`, password, access token, service role key, atau kredensial akun pengguna ke repository.

## Catatan Keamanan

Satu peringatan yang **tidak bisa di-toggle via SQL** dan perlu diaktifkan manual:

- **Leaked Password Protection** — di Supabase Dashboard, buka *Authentication → Providers → Email* dan aktifkan "Enable password strength" / leaked-password check. Ini mencegah pengguna memakai password yang sudah pernah bocor (cek terhadap HaveIBeenPwned).

Semua peringatan keamanan lain dari `get_advisors` (function search_path, SECURITY DEFINER exposure via REST, `auth.uid()` init-plan) sudah dibereskan.

## Bahasa Indonesia di seluruh UI

- Label & toast: `src/lib/i18n/messages.ts`
- Tanggal: `src/lib/date.ts` pakai `date-fns/locale/id` → "Senin, 28 Mei 2026"
- Mata uang: `src/lib/currency.ts` pakai `Intl.NumberFormat('id-ID', currency: 'IDR')`

## Kanvas Desain

Token semantik di `src/index.css` (HSL). Ganti warna brand cukup di `--primary` saja:

```css
--primary: 174 62% 32%;      /* deep teal — ganti sesuai brand */
--success: 142 62% 36%;
--warning: 38 92% 50%;
--destructive: 0 72% 51%;
```
