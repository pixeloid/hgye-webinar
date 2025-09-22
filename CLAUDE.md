Here’s a drop-in **`CLAUDE.md`** you can commit at repo root.
Scope: **Frontend (Nuxt 3 + Zoom Web SDK) + Supabase (Auth, DB, RLS, Edge Functions)** — no separate server.

---

# CLAUDE.md

## Project: Secure Zoom Webinar Join — Frontend + Supabase

### Goal

Provide 200 előregisztrált résztvevőnek **személyre szóló, nem továbbküldhető** belépést egy Zoom webináriumhoz.
A résztvevők **a mi Nuxt 3 felületünkön** csatlakoznak (Zoom Web SDK), **Zoom join URL-t nem látják**.
**Supabase** biztosítja az Auth-ot, adatbázist (RLS-szel), és az _Edge Function_ adja ki a rövid élettartamú Zoom SDK **signature**-t.
**Egyidejűség-zár**: egy meghívott csak egy aktív klienssel lehet bent (OTP-s átvétel opcionális).

---

## Tech Stack

- **Frontend:** Nuxt 3 (Vue 3, TS), @zoomus/websdk
- **Auth:** Supabase Email OTP / Magic link
- **DB:** Supabase Postgres + RLS
- **Serverless:** Supabase Edge Functions (Deno, TS)
- **State/Lock:** Postgres táblák + advisory lock (opcionális), vagy „active session” rekord TTL-el
- **Mail:** Supabase Auth invitation email (beépített) + opcionális function-alapú OTP email

---

## High-Level Flow

1. **Import 200 e-mail** → `invitees` rekordok létrehozása (name, email).
2. **Kiküldés**: Supabase Auth **invite** → user kap magic linket (email OTP) → bejelentkezik.
3. **Belépés /join**: Frontend kéri az Edge Functiont (**`issue-zoom-signature`**).

   - Function ellenőrzi a Supabase session-t + jogosultságot (`invitees.status`), _device hash_ (opcionális).
   - **Egyidejűség-zár**: ha már aktív session van, **blokkol** vagy **OTP-vel átvehető**.
   - Function **rövid TTL-ű** Zoom SDK signature-t ad (2–5 perc).

4. **Zoom Web SDK** Nuxt oldalon `init` + `join` a kapott signature-rel.
5. **Heartbeat**: frontend 12–15 mp-enként `/presence/heartbeat` functiont hív → `sessions.last_heartbeat_at` frissül.
6. **Report**: `access_logs`, `sessions` + Zoom webhookok (opcionális) → jelenléti lista.

---

## Repo Structure (suggested)

```
.
├─ apps/web/                   # Nuxt 3 (TypeScript)
│  ├─ pages/join.vue
│  ├─ pages/invite/upload.vue  # CSV import admin nézet
│  ├─ composables/useDeviceHash.ts
│  ├─ server/api/…             # (opcionális) Nuxt server routes - csak proxyra, nem titokra
│  └─ utils/zoom.ts
├─ supabase/
│  ├─ migrations/
│  │  └─ 000001_init.sql
│  ├─ functions/
│  │  ├─ issue-zoom-signature/index.ts
│  │  ├─ presence-heartbeat/index.ts
│  │  └─ otp-transfer/index.ts
│  └─ seed/
│     └─ invitees.csv
├─ .env.local.example
└─ CLAUDE.md
```

---

## Environment

`.env.local` (Nuxt) – **ne** tegyél titkot ide, csak publikus azonosítókat:

```
NUXT_PUBLIC_SUPABASE_URL=...
NUXT_PUBLIC_SUPABASE_ANON_KEY=...
NUXT_PUBLIC_ZOOM_SDK_KEY=...            # csak key (public), secret NEM ide kerül
NUXT_PUBLIC_ZOOM_MEETING_NUMBER=...     # vagy webinar ID
NUXT_PUBLIC_LEAVE_URL=https://domain.tld/thanks
```

Supabase **Function Secrets** (CLI `supabase secrets set`):

```
ZOOM_SDK_KEY=...
ZOOM_SDK_SECRET=...        # confidential
ZOOM_MEETING_NUMBER=...
ZOOM_PASSWORD=...          # ha kell
JWT_AUDIENCE=authenticated  # default
```

---

## Database Schema (SQL)

`supabase/migrations/000001_init.sql`:

```sql
-- invitees: jogosultsági lista
create table public.invitees (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  webinar_id text not null,
  status text not null default 'invited', -- invited | claimed | joined | completed | blocked
  device_hash text,
  zoom_registrant_id text, -- opcionális, ha később Zoom REST-et is használunk
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

-- sessions: aktív belépések és heartbeat
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid not null references public.invitees(id) on delete cascade,
  ip inet,
  user_agent text,
  device_hash text,
  active boolean not null default true,
  created_at timestamptz default now(),
  last_heartbeat_at timestamptz default now()
);

-- access_logs: audit
create table public.access_logs (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid references public.invitees(id) on delete set null,
  event_type text not null, -- magic_open | sdk_issued | join_denied | duplicate_attempt | otp_sent | otp_verified | kicked
  meta jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table public.invitees enable row level security;
alter table public.sessions enable row level security;
alter table public.access_logs enable row level security;

-- Policy: a bejelentkezett user csak a saját email rekordját láthatja
create policy "invitee_self_read"
  on public.invitees for select
  using ( auth.email() = email );

-- A frontend nem írja közvetlenül az invitees-t (csak Functions), ezért csak select:
create policy "invitee_self_no_write"
  on public.invitees for all
  using ( false ) with check ( false );

-- sessions: a user csak a saját invitee_id-hez tartozó aktív sessionjét olvassa
create policy "sessions_self_read"
  on public.sessions for select
  using (
    invitee_id in (select id from public.invitees where email = auth.email())
  );

-- insert/update sessions csak Edge Functionből (service role) – a publikus kliens ne írhassa
create policy "sessions_no_client_write"
  on public.sessions for all
  using ( false ) with check ( false );

-- access_logs csak service role írja; user olvashatja a sajátját (opcionális)
create policy "access_logs_self_read"
  on public.access_logs for select
  using (
    invitee_id in (select id from public.invitees where email = auth.email())
  );

create policy "access_logs_no_client_write"
  on public.access_logs for all
  using ( false ) with check ( false );
```

> Megjegyzés: az írásokat **mindig Edge Function** végzi `service_role` kulccsal.

---

## Supabase Auth

- **Invite flow:** Admin import → `auth.admin.inviteUserByEmail(email)` (via dashboard vagy script).
- Résztvevő **magic link**-kel lép be → `auth.email() == invitees.email` RLS kulcs.

---

## Edge Functions

### 1) `issue-zoom-signature` (HTTP)

**Feladat:**

- Ellenőrzi, hogy be van-e jelentkezve (`getUser`).
- Megkeresi az `invitees` rekordot az `auth.email()` alapján.
- **Concurrency lock:**

  - ha van aktív session ugyanannak az invitee-nek (recent `last_heartbeat_at` < 30s), **403** + `reason: "duplicate"`.
  - különben létrehoz `sessions` rekordot és **inaktiválja** az előzőket.

- Kiír `access_logs (sdk_issued)`.
- Visszaad **rövid TTL** (max 300s) Zoom **SDK signature**-t.

**Input (JSON):**

```json
{ "deviceHash": "sha256(...)", "userAgent": "...", "ip": "auto" }
```

**Output (JSON):**

```json
{
  "signature": "...",
  "sdkKey": "...",
  "meetingNumber": "...",
  "userName": "Full Name",
  "userEmail": "user@example.com",
  "passWord": "optional"
}
```

**Skeleton (TypeScript / Deno):**

```ts
// supabase/functions/issue-zoom-signature/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { fetch } }
  );

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user)
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });

  const { deviceHash, userAgent } = await req.json().catch(() => ({}));
  const email = user.email!;

  // Fetch invitee
  const { data: invitee } = await supabase
    .from("invitees")
    .select("*")
    .eq("email", email)
    .single();
  if (!invitee || invitee.status === "blocked") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
    });
  }

  // Concurrency check (active session within 30s)
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data: active } = await supabase
    .from("sessions")
    .select("id")
    .eq("invitee_id", invitee.id)
    .eq("active", true)
    .gte("last_heartbeat_at", since)
    .limit(1);

  if (active && active.length > 0) {
    // log duplicate attempt
    await supabase.from("access_logs").insert({
      invitee_id: invitee.id,
      event_type: "duplicate_attempt",
      meta: { userAgent, deviceHash },
    });
    return new Response(JSON.stringify({ error: "duplicate" }), {
      status: 423,
    });
  }

  // Deactivate previous sessions
  await supabase
    .from("sessions")
    .update({ active: false })
    .eq("invitee_id", invitee.id);

  // Create new session
  await supabase.from("sessions").insert({
    invitee_id: invitee.id,
    user_agent: userAgent,
    device_hash: deviceHash,
    active: true,
  });

  // Generate Zoom SDK signature
  const sdkKey = Deno.env.get("ZOOM_SDK_KEY")!;
  const sdkSecret = Deno.env.get("ZOOM_SDK_SECRET")!;
  const meetingNumber = Deno.env.get("ZOOM_MEETING_NUMBER")!;
  const role = 0;

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 3; // 3 minutes
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sdkKey,
    mn: meetingNumber,
    role,
    iat,
    exp,
    appKey: sdkKey,
    tokenExp: exp,
  };

  // Minimal JWT HMAC-SHA256 builder
  const base64url = (obj: any) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const encHeader = base64url(header);
  const encPayload = base64url(payload);
  const data = `${encHeader}.${encPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sdkSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  const signature = `${data}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")}`;

  await supabase.from("access_logs").insert({
    invitee_id: invitee.id,
    event_type: "sdk_issued",
    meta: { exp, deviceHash },
  });

  return new Response(
    JSON.stringify({
      signature,
      sdkKey,
      meetingNumber,
      userName: invitee.full_name ?? email,
      userEmail: email,
      passWord: Deno.env.get("ZOOM_PASSWORD") ?? "",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
```

### 2) `presence-heartbeat` (HTTP)

- Input: none (session by auth.email + latest active row).
- Update `sessions.last_heartbeat_at = now()`.
- If nincs aktív session → 404 (frontend leállítja a Zoomot).

### 3) `otp-transfer` (HTTP, opcionális)

- Duplicate esetén e-mail OTP küldése és **lock átvétel** jóváhagyása.
- `invitees.device_hash` frissítése az új eszköz hash-re, régi session `active=false`.

---

## Frontend (Nuxt 3)

**Device hash util:** `apps/web/composables/useDeviceHash.ts`
Gyors implement: UA + timezone + platform → SHA-256; (opcionálisan canvas/webgl fingerprintet is adhatsz).

**Join Page:** `apps/web/pages/join.vue`

```vue
<script setup lang="ts">
import { ZoomMtg } from "@zoomus/websdk";
const supabase = useSupabaseClient();
const router = useRouter();

const deviceHash = await useDeviceHash(); // your util
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) {
  await router.push("/login");
}

onMounted(async () => {
  ZoomMtg.setZoomJSLib("https://source.zoom.us/3.9.0/lib", "/av");
  ZoomMtg.preLoadWasm();
  ZoomMtg.prepareJssdk();

  const resp = await $fetch("/functions/v1/issue-zoom-signature", {
    method: "POST",
    body: { deviceHash, userAgent: navigator.userAgent },
  }).catch((e) => e?.data || e);

  if (resp?.error === "duplicate") {
    // show UI: "Már van aktív bejelentkezésed." → OTP transfer flow
    return;
  }
  if (resp?.error) {
    // show error page
    return;
  }

  const { signature, sdkKey, meetingNumber, userName, userEmail, passWord } =
    resp;

  ZoomMtg.init({
    leaveUrl: useRuntimeConfig().public.leaveUrl,
    success: () => {
      ZoomMtg.join({
        signature,
        sdkKey,
        meetingNumber,
        userName,
        userEmail,
        passWord,
        success: () => startHeartbeat(),
        error: (err) => console.error("Zoom join error", err),
      });
    },
    error: (err) => console.error("Zoom init error", err),
  });
});

function startHeartbeat() {
  setInterval(() => {
    $fetch("/functions/v1/presence-heartbeat", { method: "POST" }).catch(() => {
      /* optionally end session if repeated failures */
    });
  }, 12000);
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    Csatlakozás folyamatban…
  </div>
</template>
```

---

## CSV Import & Invite

- Admin page (`/invite/upload`) feltölti a CSV-t → kliens oldalon hívj **Functiont** vagy **service role**-os admin scriptet lokálról (biztonságosabb).
- Ajánlott: futtasd lokális Node scripttel `SUPABASE_SERVICE_ROLE` kulccsal:

  1. `insert into invitees (email, full_name, webinar_id) values ...`
  2. `auth.admin.inviteUserByEmail(email)` minden címre (Supabase JS admin klienssel)

---

## Security Checklist

- **Signature TTL ≤ 3–5 perc**, újratöltéskor új signature.
- **RLS**: kliens csak olvas a saját rekordjából, írás **csak** Functionből.
- **HTTPS + HSTS**
- **No join_url exposure** (nem is használjuk).
- **Rate limit** a Functions-on (DDoS/OTP spam ellen).
- **IP/geo anomália jelzés** (logba).
- **Watermark** (Zoom beállításban, ha licenc elérhető).

---

## Developer Commands

```bash
# Supabase local
supabase start
supabase db reset

# Apply migration
supabase migration up

# Deploy functions
supabase functions deploy issue-zoom-signature
supabase functions deploy presence-heartbeat
supabase functions deploy otp-transfer

# Set function secrets
supabase secrets set ZOOM_SDK_KEY=... ZOOM_SDK_SECRET=... ZOOM_MEETING_NUMBER=... ZOOM_PASSWORD=...

# Nuxt dev
pnpm i
pnpm dev --filter apps/web
```

---

## Acceptance Criteria

- [ ] Meghívott user csak **saját** e-maillel léphet be (Supabase Auth).
- [ ] **Zoom Web SDK** sikeres csatlakozás signature-rel, join URL nélkül.
- [ ] **Egyidejűség-zár** működik: második kliens tiltva, OTP-vel átvehető (ha bekapcsoltuk).
- [ ] **Heartbeat** tartja életben a sessiont; megszűnéskor aktív=false.
- [ ] **Report**: lekérdezhető a részvétel (`sessions`, `access_logs`).

---

## Optional Variants

1. **Light mode:** concurrency lock és device hash nélkül — csak Auth + signature kiadás.
2. **Device binding strict:** első belépés rögzíti a `device_hash`-t; eltéréskor kötelező OTP.
3. **Registrant sync:** `zoom_registrant_id` előregisztráció (Zoom REST), ha szervezői riporthoz kell.

---

**Notes to Agent (Claude):**

- Tartsd be az RLS szabályokat: a kliens ne írjon DB-be, minden mutáció **Edge Functionből** menjen.
- Ne logolj titkokat (Zoom secret, service role).
- A Zoom Web SDK verziót rögzítsd (pl. `3.9.0`), és különítsd el az AV lib path-ot.
- Signature generálásnál **HS256** JWT formátumot használj, a `appKey/sdkKey` mezőkkel.
- Nuxt route guard: `/join` csak **authenticated** usernek.
